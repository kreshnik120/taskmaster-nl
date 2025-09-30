-- Extend subtasks table for process tracking
-- Add status field (replaces boolean 'done')
CREATE TYPE public.subtask_status AS ENUM ('pending', 'active', 'completed', 'skipped');

ALTER TABLE public.subtasks 
ADD COLUMN status public.subtask_status NOT NULL DEFAULT 'pending',
ADD COLUMN due_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN assignee_id UUID REFERENCES public.profiles(id),
ADD COLUMN depends_on_subtask_id UUID REFERENCES public.subtasks(id);

-- Migrate existing 'done' data to new status field
UPDATE public.subtasks 
SET status = CASE 
  WHEN done = true THEN 'completed'::public.subtask_status
  ELSE 'pending'::public.subtask_status
END;

-- Drop old 'done' column
ALTER TABLE public.subtasks DROP COLUMN done;

-- Create function to auto-activate next subtask when one is completed
CREATE OR REPLACE FUNCTION public.auto_activate_next_subtask()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if subtask was just marked as completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Find next subtask in order that's still pending
    UPDATE public.subtasks
    SET status = 'active'
    WHERE task_id = NEW.task_id
      AND "order" = (
        SELECT MIN("order")
        FROM public.subtasks
        WHERE task_id = NEW.task_id
          AND "order" > NEW."order"
          AND status = 'pending'
      )
      AND status = 'pending';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-activation
CREATE TRIGGER trigger_auto_activate_next_subtask
  AFTER UPDATE ON public.subtasks
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_activate_next_subtask();

-- Activate first subtask of each task that has no active subtasks
UPDATE public.subtasks st1
SET status = 'active'
WHERE "order" = (
  SELECT MIN("order")
  FROM public.subtasks st2
  WHERE st2.task_id = st1.task_id
)
AND status = 'pending'
AND NOT EXISTS (
  SELECT 1 FROM public.subtasks st3
  WHERE st3.task_id = st1.task_id AND st3.status = 'active'
);