-- Fix log_vacancy_events trigger: correct uren_per_week_min/max to uren_per_week
CREATE OR REPLACE FUNCTION public.log_vacancy_events()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.system_events (
      event_type, entity_type, entity_id, event_data, org_id, user_id, metadata
    ) VALUES (
      'vacancy_created',
      'vacancy',
      NEW.id,
      jsonb_build_object(
        'titel', NEW.titel,
        'functie_niveau', NEW.functie_niveau,
        'sublocation_id', NEW.sublocation_id,
        'urgentie', NEW.urgentie,
        'uren_per_week', NEW.uren_per_week,
        'start_datum', NEW.start_datum,
        'deadline', NEW.deadline
      ),
      NULL,
      NEW.created_by,
      '{}'::jsonb
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.system_events (
        event_type, entity_type, entity_id, event_data, org_id, user_id, metadata
      ) VALUES (
        'vacancy_status_changed',
        'vacancy',
        NEW.id,
        jsonb_build_object(
          'titel', NEW.titel,
          'old_status', OLD.status,
          'new_status', NEW.status,
          'sublocation_id', NEW.sublocation_id
        ),
        NULL,
        auth.uid(),
        '{}'::jsonb
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;