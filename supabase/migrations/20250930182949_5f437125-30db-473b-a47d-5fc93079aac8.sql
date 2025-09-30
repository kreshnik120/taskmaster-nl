-- Add shown_at column to reminders table
ALTER TABLE public.reminders
ADD COLUMN shown_at timestamp with time zone;

-- Add index for efficient querying of pending reminders
CREATE INDEX idx_reminders_pending ON public.reminders(at, shown_at) 
WHERE shown_at IS NULL;