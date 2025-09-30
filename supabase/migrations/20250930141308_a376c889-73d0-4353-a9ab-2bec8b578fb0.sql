-- Add columns for task acceptance tracking
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS accepted_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES auth.users(id);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_tasks_accepted_by ON public.tasks(accepted_by);