-- Enable realtime for time_entries table
ALTER PUBLICATION supabase_realtime ADD TABLE public.time_entries;

-- Add index for faster active timer queries
CREATE INDEX IF NOT EXISTS idx_time_entries_active 
ON public.time_entries(user_id, task_id) 
WHERE "end" IS NULL;