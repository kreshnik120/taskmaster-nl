-- Create system_events table for automatic learning
CREATE TABLE IF NOT EXISTS public.system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  event_data JSONB NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  learning_outcome JSONB
);

-- Create indices for efficient queries
CREATE INDEX IF NOT EXISTS idx_system_events_unprocessed ON public.system_events(created_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_system_events_type ON public.system_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_org ON public.system_events(org_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view events in their org"
  ON public.system_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = system_events.org_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage all events"
  ON public.system_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create trigger function for task events
CREATE OR REPLACE FUNCTION public.log_task_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Task completed
  IF TG_OP = 'UPDATE' AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL THEN
    INSERT INTO public.system_events (org_id, user_id, event_type, entity_type, entity_id, event_data, metadata)
    VALUES (
      NEW.org_id,
      NEW.updated_by,
      'task_completed',
      'task',
      NEW.id,
      jsonb_build_object(
        'title', NEW.title,
        'assignee_id', NEW.assignee_id,
        'priority', NEW.priority,
        'completed_at', NEW.completed_at,
        'due_at', NEW.due_at,
        'created_at', NEW.created_at
      ),
      jsonb_build_object(
        'on_time', CASE 
          WHEN NEW.due_at IS NULL THEN true
          WHEN NEW.completed_at <= NEW.due_at THEN true 
          ELSE false 
        END,
        'days_late', CASE 
          WHEN NEW.due_at IS NOT NULL AND NEW.completed_at > NEW.due_at 
          THEN EXTRACT(DAY FROM NEW.completed_at - NEW.due_at)::integer
          ELSE 0 
        END,
        'hours_worked', COALESCE(
          (SELECT SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 3600)
           FROM public.time_entries
           WHERE task_id = NEW.id
           AND ended_at IS NOT NULL),
          0
        )
      )
    );
  END IF;
  
  -- Task created
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.system_events (org_id, user_id, event_type, entity_type, entity_id, event_data)
    VALUES (
      NEW.org_id,
      NEW.created_by,
      'task_created',
      'task',
      NEW.id,
      jsonb_build_object(
        'title', NEW.title,
        'assignee_id', NEW.assignee_id,
        'priority', NEW.priority,
        'due_at', NEW.due_at,
        'created_at', NEW.created_at
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Attach trigger to tasks table
DROP TRIGGER IF EXISTS task_event_logger ON public.tasks;
CREATE TRIGGER task_event_logger
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.log_task_events();

-- Create category_suggestions table for auto-categorization
CREATE TABLE IF NOT EXISTS public.category_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  suggested_category TEXT NOT NULL,
  reasoning TEXT,
  example_key TEXT,
  confidence NUMERIC DEFAULT 0.5,
  status TEXT DEFAULT 'pending_review',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.category_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Org members can view category suggestions"
  ON public.category_suggestions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = category_suggestions.org_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage category suggestions"
  ON public.category_suggestions
  FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = category_suggestions.org_id
      AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage category suggestions"
  ON public.category_suggestions
  FOR ALL
  USING (true)
  WITH CHECK (true);