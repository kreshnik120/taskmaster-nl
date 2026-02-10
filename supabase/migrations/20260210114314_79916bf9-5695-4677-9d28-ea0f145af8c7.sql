-- Update notify_subtask_assignment: add triggered_by to metadata
CREATE OR REPLACE FUNCTION public.notify_subtask_assignment()
RETURNS TRIGGER AS $$
DECLARE
  task_title TEXT;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.assignee_id IS NOT NULL) 
     OR (TG_OP = 'UPDATE' AND NEW.assignee_id IS DISTINCT FROM OLD.assignee_id 
         AND NEW.assignee_id IS NOT NULL) THEN
    
    SELECT title INTO task_title FROM public.tasks WHERE id = NEW.task_id;
    
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
        'due_at', NEW.due_at,
        'triggered_by', auth.uid()
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update notify_task_assignment: add triggered_by to metadata
CREATE OR REPLACE FUNCTION public.notify_task_assignment()
RETURNS TRIGGER AS $$
DECLARE
  v_assigner_name TEXT;
  v_old_assignee_name TEXT;
  v_new_assignee_name TEXT;
BEGIN
  IF (OLD.assignee_id IS DISTINCT FROM NEW.assignee_id) THEN
    SELECT name INTO v_assigner_name FROM profiles WHERE id = auth.uid();
    SELECT name INTO v_old_assignee_name FROM profiles WHERE id = OLD.assignee_id;
    SELECT name INTO v_new_assignee_name FROM profiles WHERE id = NEW.assignee_id;

    IF NEW.assignee_id IS NOT NULL THEN
      INSERT INTO recruiter_notifications (
        org_id, user_id, notification_type, title, message, metadata, created_at
      ) VALUES (
        NEW.org_id,
        NEW.assignee_id,
        'task_assigned',
        'Taak toegewezen',
        format('%s heeft taak "%s" aan jou toegewezen',
               COALESCE(v_assigner_name, 'Iemand'), LEFT(NEW.title, 50)),
        jsonb_build_object(
          'task_id', NEW.id,
          'task_title', NEW.title,
          'assigned_by', auth.uid(),
          'assigned_by_name', v_assigner_name,
          'triggered_by', auth.uid()
        ),
        NOW()
      );
    END IF;

    INSERT INTO task_action_history (
      task_id, action_text, action_type, created_by, completed_at, completed_by, is_current, metadata
    ) VALUES (
      NEW.id,
      CASE
        WHEN OLD.assignee_id IS NULL AND NEW.assignee_id IS NOT NULL
          THEN format('Toegewezen aan %s', COALESCE(v_new_assignee_name, 'onbekend'))
        WHEN OLD.assignee_id IS NOT NULL AND NEW.assignee_id IS NULL
          THEN format('Toewijzing verwijderd (was: %s)', COALESCE(v_old_assignee_name, 'onbekend'))
        ELSE format('Hertoegewezen van %s naar %s',
                    COALESCE(v_old_assignee_name, 'onbekend'),
                    COALESCE(v_new_assignee_name, 'onbekend'))
      END,
      'assignment_change',
      auth.uid(), NOW(), auth.uid(), false,
      jsonb_build_object(
        'old_assignee_id', OLD.assignee_id,
        'old_assignee_name', v_old_assignee_name,
        'new_assignee_id', NEW.assignee_id,
        'new_assignee_name', v_new_assignee_name
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;