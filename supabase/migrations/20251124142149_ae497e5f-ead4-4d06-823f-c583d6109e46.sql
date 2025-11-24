-- Fix log_task_events trigger with correct column names (end/start instead of ended_at/started_at)
CREATE OR REPLACE FUNCTION public.log_task_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Task completed event
  IF TG_OP = 'UPDATE' AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL THEN
    INSERT INTO public.system_events (org_id, user_id, event_type, entity_type, entity_id, event_data, metadata)
    VALUES (
      NEW.org_id,
      COALESCE(auth.uid(), NEW.assignee_id, NEW.reporter_id),
      'task_completed',
      'task',
      NEW.id,
      jsonb_build_object(
        'title', NEW.title,
        'assignee_id', NEW.assignee_id,
        'priority', NEW.priority,
        'completed_at', NEW.completed_at,
        'due_at', NEW.due_at,
        'created_at', NEW.created_at
      ),
      jsonb_build_object(
        'on_time', CASE 
          WHEN NEW.due_at IS NULL THEN true
          WHEN NEW.completed_at <= NEW.due_at THEN true 
          ELSE false 
        END,
        'days_late', CASE 
          WHEN NEW.due_at IS NOT NULL AND NEW.completed_at > NEW.due_at 
          THEN EXTRACT(DAY FROM NEW.completed_at - NEW.due_at)::integer
          ELSE 0 
        END,
        'hours_worked', COALESCE(
          (SELECT SUM(EXTRACT(EPOCH FROM ("end" - "start")) / 3600)
           FROM public.time_entries
           WHERE task_id = NEW.id
           AND "end" IS NOT NULL),
          0
        )
      )
    );
  END IF;
  
  -- Task created event
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.system_events (org_id, user_id, event_type, entity_type, entity_id, event_data)
    VALUES (
      NEW.org_id,
      COALESCE(NEW.reporter_id, auth.uid()),
      'task_created',
      'task',
      NEW.id,
      jsonb_build_object(
        'title', NEW.title,
        'assignee_id', NEW.assignee_id,
        'priority', NEW.priority,
        'due_at', NEW.due_at,
        'created_at', NEW.created_at
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;