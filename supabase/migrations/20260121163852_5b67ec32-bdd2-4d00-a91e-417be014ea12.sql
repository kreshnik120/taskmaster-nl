-- Create task_action_history table for tracking follow-up actions
CREATE TABLE public.task_action_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  action_text TEXT NOT NULL,
  action_type TEXT DEFAULT 'followup' CHECK (action_type IN ('followup', 'note', 'status_change')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.profiles(id),
  is_current BOOLEAN DEFAULT false,
  order_index INTEGER DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.task_action_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view action history for their org tasks"
ON public.task_action_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_action_history.task_id
  )
);

CREATE POLICY "Users can insert action history"
ON public.task_action_history
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_action_history.task_id
  )
);

CREATE POLICY "Users can update action history"
ON public.task_action_history
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_action_history.task_id
  )
);

CREATE POLICY "Users can delete action history"
ON public.task_action_history
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_action_history.task_id
  )
);

-- Create index for faster queries
CREATE INDEX idx_task_action_history_task_id ON public.task_action_history(task_id);
CREATE INDEX idx_task_action_history_is_current ON public.task_action_history(is_current) WHERE is_current = true;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_action_history;