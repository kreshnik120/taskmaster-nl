-- Create task_scoring_metadata table for extended prioritizer data
CREATE TABLE IF NOT EXISTS public.task_scoring_metadata (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  estimated_value_eur numeric,
  complexity_score numeric DEFAULT 0.5,
  business_impact_score numeric DEFAULT 0.5,
  market_demand_factor numeric DEFAULT 1.0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(task_id)
);

-- Create task_feedback_events table for learning from outcomes
CREATE TABLE IF NOT EXISTS public.task_feedback_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  segment jsonb NOT NULL DEFAULT '{}'::jsonb,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create prioritizer_state table for storing model state
CREATE TABLE IF NOT EXISTS public.prioritizer_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  segment_key text NOT NULL UNIQUE,
  weights jsonb NOT NULL DEFAULT '{"w_money":0.55,"w_sla":0.15,"w_qual":0.15,"w_cust":0.10,"w_grow":0.05}'::jsonb,
  betas jsonb NOT NULL DEFAULT '{}'::jsonb,
  percentiles jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_updated timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.task_scoring_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_feedback_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prioritizer_state ENABLE ROW LEVEL SECURITY;

-- RLS policies for task_scoring_metadata
CREATE POLICY "Users can view metadata for their org tasks"
ON public.task_scoring_metadata FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks
    JOIN public.user_organizations ON user_organizations.org_id = tasks.org_id
    WHERE tasks.id = task_scoring_metadata.task_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Users can manage metadata for their org tasks"
ON public.task_scoring_metadata FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.tasks
    JOIN public.user_organizations ON user_organizations.org_id = tasks.org_id
    WHERE tasks.id = task_scoring_metadata.task_id
    AND user_organizations.user_id = auth.uid()
  )
);

-- RLS policies for task_feedback_events
CREATE POLICY "Users can view feedback for their org tasks"
ON public.task_feedback_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks
    JOIN public.user_organizations ON user_organizations.org_id = tasks.org_id
    WHERE tasks.id = task_feedback_events.task_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create feedback for their org tasks"
ON public.task_feedback_events FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks
    JOIN public.user_organizations ON user_organizations.org_id = tasks.org_id
    WHERE tasks.id = task_feedback_events.task_id
    AND user_organizations.user_id = auth.uid()
  )
);

-- RLS policies for prioritizer_state
CREATE POLICY "Users can view prioritizer state"
ON public.prioritizer_state FOR SELECT
USING (true);

CREATE POLICY "Users can manage prioritizer state"
ON public.prioritizer_state FOR ALL
USING (true);

-- Trigger for updated_at on task_scoring_metadata
CREATE TRIGGER update_task_scoring_metadata_updated_at
BEFORE UPDATE ON public.task_scoring_metadata
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_task_scoring_metadata_task_id ON public.task_scoring_metadata(task_id);
CREATE INDEX IF NOT EXISTS idx_task_feedback_events_task_id ON public.task_feedback_events(task_id);
CREATE INDEX IF NOT EXISTS idx_prioritizer_state_segment_key ON public.prioritizer_state(segment_key);