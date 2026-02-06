-- Update the log_task_description_change function to store full description text
CREATE OR REPLACE FUNCTION public.log_task_description_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_user_name TEXT;
  v_change_type TEXT;
  v_metadata JSONB;
BEGIN
  -- Only trigger on actual description changes
  IF OLD.description IS DISTINCT FROM NEW.description THEN
    -- Get the user's name
    SELECT COALESCE(p.name, p.email, 'Systeem')
    INTO v_user_name
    FROM profiles p
    WHERE p.id = auth.uid();
    
    -- Determine change type
    IF OLD.description IS NULL OR OLD.description = '' THEN
      v_change_type := 'added';
    ELSIF NEW.description IS NULL OR NEW.description = '' THEN
      v_change_type := 'removed';
    ELSE
      v_change_type := 'modified';
    END IF;
    
    -- Build extended metadata with full text
    v_metadata := jsonb_build_object(
      'old_length', COALESCE(LENGTH(OLD.description), 0),
      'new_length', COALESCE(LENGTH(NEW.description), 0),
      'old_description', OLD.description,
      'new_description', NEW.description,
      'changed_by_name', v_user_name,
      'change_type', v_change_type
    );
    
    -- Insert into action history with metadata
    INSERT INTO task_action_history (
      task_id,
      action_text,
      action_type,
      created_by,
      is_current,
      metadata
    ) VALUES (
      NEW.id,
      CASE v_change_type
        WHEN 'added' THEN 'Beschrijving toegevoegd'
        WHEN 'removed' THEN 'Beschrijving verwijderd'
        ELSE 'Beschrijving gewijzigd'
      END,
      'description_change',
      auth.uid(),
      false,
      v_metadata
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Ensure trigger is connected (recreate to be safe)
DROP TRIGGER IF EXISTS log_task_description_change ON tasks;
CREATE TRIGGER log_task_description_change
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION log_task_description_change();