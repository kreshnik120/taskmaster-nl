-- Add soft delete fields to tasks table
ALTER TABLE public.tasks 
ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN deleted_by UUID REFERENCES auth.users(id);

-- Create index for better query performance on deleted tasks
CREATE INDEX idx_tasks_deleted_at ON public.tasks(deleted_at) WHERE deleted_at IS NOT NULL;

-- Create index for active (non-deleted) tasks
CREATE INDEX idx_tasks_active ON public.tasks(deleted_at) WHERE deleted_at IS NULL;