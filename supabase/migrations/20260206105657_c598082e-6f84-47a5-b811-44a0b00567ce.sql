-- Update de trigger om duplicaten te voorkomen met 5-seconden check
CREATE OR REPLACE FUNCTION log_task_description_change()
RETURNS TRIGGER AS $$
DECLARE
  change_type TEXT;
  old_len INT;
  new_len INT;
  changer_name TEXT;
  recent_exists BOOLEAN;
BEGIN
  -- Skip als beschrijving niet is gewijzigd
  IF OLD.description IS NOT DISTINCT FROM NEW.description THEN
    RETURN NEW;
  END IF;

  -- Check of er al een entry bestaat binnen de laatste 5 seconden voor dezelfde task
  SELECT EXISTS (
    SELECT 1 FROM task_action_history
    WHERE task_id = NEW.id
      AND action_type = 'description_change'
      AND created_at > NOW() - INTERVAL '5 seconds'
  ) INTO recent_exists;

  -- Als er al een recente entry is, skip deze trigger
  IF recent_exists THEN
    RETURN NEW;
  END IF;

  -- Bepaal change type
  old_len := COALESCE(LENGTH(OLD.description), 0);
  new_len := COALESCE(LENGTH(NEW.description), 0);
  
  IF old_len = 0 AND new_len > 0 THEN
    change_type := 'added';
  ELSIF old_len > 0 AND new_len = 0 THEN
    change_type := 'removed';
  ELSE
    change_type := 'modified';
  END IF;

  -- Haal naam op van de wijziger
  SELECT COALESCE(p.name, 'Onbekend')
  INTO changer_name
  FROM profiles p
  WHERE p.id = auth.uid();

  -- Voeg history entry toe
  INSERT INTO task_action_history (
    task_id,
    action_type,
    action_text,
    created_by,
    metadata
  ) VALUES (
    NEW.id,
    'description_change',
    CASE 
      WHEN change_type = 'added' THEN 'Beschrijving toegevoegd'
      WHEN change_type = 'removed' THEN 'Beschrijving verwijderd'
      ELSE 'Beschrijving gewijzigd'
    END,
    auth.uid(),
    jsonb_build_object(
      'old_description', OLD.description,
      'new_description', NEW.description,
      'change_type', change_type,
      'old_length', old_len,
      'new_length', new_len,
      'changed_by_name', changer_name
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;