-- Add columns to reminders table for enhanced functionality
ALTER TABLE public.reminders 
ADD COLUMN IF NOT EXISTS repeat_interval text DEFAULT 'NONE' CHECK (repeat_interval IN ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY')),
ADD COLUMN IF NOT EXISTS subtask_id uuid REFERENCES public.subtasks(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS title text;

-- Add check constraint to ensure either task_id or subtask_id is set, but not both
ALTER TABLE public.reminders 
ADD CONSTRAINT reminders_task_or_subtask_check 
CHECK (
  (task_id IS NOT NULL AND subtask_id IS NULL) OR 
  (task_id IS NULL AND subtask_id IS NOT NULL)
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_reminders_subtask_id ON public.reminders(subtask_id);
CREATE INDEX IF NOT EXISTS idx_reminders_at ON public.reminders(at);

-- Update RLS policies for subtasks reminders
CREATE POLICY "Users can manage subtask reminders" ON public.reminders
FOR ALL
USING (
  subtask_id IS NOT NULL AND
  EXISTS (
    SELECT 1
    FROM subtasks
    JOIN tasks ON tasks.id = subtasks.task_id
    JOIN user_organizations ON user_organizations.org_id = tasks.org_id
    WHERE subtasks.id = reminders.subtask_id 
    AND user_organizations.user_id = auth.uid()
  )
);