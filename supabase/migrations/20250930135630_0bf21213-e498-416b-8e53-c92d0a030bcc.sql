-- Add sequence_number column to tasks table
ALTER TABLE public.tasks 
ADD COLUMN sequence_number INTEGER;

-- Create a sequence for task numbering
CREATE SEQUENCE IF NOT EXISTS public.tasks_sequence_number_seq;

-- Create function to set sequence_number on insert
CREATE OR REPLACE FUNCTION public.set_task_sequence_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sequence_number IS NULL THEN
    NEW.sequence_number := nextval('public.tasks_sequence_number_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set sequence_number
CREATE TRIGGER set_task_sequence_number_trigger
BEFORE INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_task_sequence_number();

-- Backfill existing tasks with sequence numbers based on created_at
WITH numbered_tasks AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (ORDER BY created_at ASC) as seq_num
  FROM public.tasks
  WHERE sequence_number IS NULL
)
UPDATE public.tasks
SET sequence_number = numbered_tasks.seq_num
FROM numbered_tasks
WHERE tasks.id = numbered_tasks.id;

-- Set the sequence to continue from the highest existing number
SELECT setval('public.tasks_sequence_number_seq', COALESCE((SELECT MAX(sequence_number) FROM public.tasks), 0) + 1, false);