-- Trigger functie voor subtask assignment notificaties
CREATE OR REPLACE FUNCTION public.notify_subtask_assignment()
RETURNS TRIGGER AS $$
DECLARE
  task_title TEXT;
BEGIN
  -- Alleen triggeren bij nieuwe toewijzing of wijziging van assignee
  IF (TG_OP = 'INSERT' AND NEW.assignee_id IS NOT NULL) 
     OR (TG_OP = 'UPDATE' AND NEW.assignee_id IS DISTINCT FROM OLD.assignee_id 
         AND NEW.assignee_id IS NOT NULL) THEN
    
    -- Haal taak titel op
    SELECT title INTO task_title FROM public.tasks WHERE id = NEW.task_id;
    
    -- Maak notificatie aan voor de toegewezen collega
    INSERT INTO public.recruiter_notifications (
      user_id,
      notification_type,
      title,
      message,
      metadata
    ) VALUES (
      NEW.assignee_id,
      'subtask_assignment',
      'Nieuwe subtaak toegewezen',
      format('Je bent toegewezen aan: "%s" (onderdeel van %s)', 
             NEW.title, COALESCE(task_title, 'een taak')),
      jsonb_build_object(
        'subtask_id', NEW.id,
        'task_id', NEW.task_id,
        'subtask_title', NEW.title,
        'due_at', NEW.due_at
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger koppelen aan subtasks tabel
DROP TRIGGER IF EXISTS on_subtask_assignment ON public.subtasks;
CREATE TRIGGER on_subtask_assignment
  AFTER INSERT OR UPDATE ON public.subtasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_subtask_assignment();