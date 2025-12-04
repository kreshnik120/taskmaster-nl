-- Add interview_details JSONB column to tasks table
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS interview_details JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.tasks.interview_details IS 'Stores interview scheduling details: scheduled_at, duration_minutes, location_type, location_details, notes, send_reminder, email_sent, calendar_exported';

-- Create index for querying interview tasks
CREATE INDEX IF NOT EXISTS idx_tasks_interview_details 
ON public.tasks USING GIN (interview_details) 
WHERE interview_details IS NOT NULL;

-- Add new system event types for interview tracking
-- (These are just for documentation, actual events are inserted dynamically)