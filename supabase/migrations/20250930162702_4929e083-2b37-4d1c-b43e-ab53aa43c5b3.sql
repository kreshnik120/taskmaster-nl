-- Fix search_path security issue for auto_activate_next_subtask function
CREATE OR REPLACE FUNCTION public.auto_activate_next_subtask()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;