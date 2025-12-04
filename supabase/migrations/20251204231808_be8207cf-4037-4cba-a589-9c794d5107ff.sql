-- Add system_events triggers for vacancy AI learning

-- Trigger function for vacancy events
CREATE OR REPLACE FUNCTION public.log_vacancy_events()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.system_events (
      event_type,
      entity_type,
      entity_id,
      event_data,
      org_id,
      user_id,
      metadata
    ) VALUES (
      'vacancy_created',
      'vacancy',
      NEW.id,
      jsonb_build_object(
        'titel', NEW.titel,
        'functie_niveau', NEW.functie_niveau,
        'sublocation_id', NEW.sublocation_id,
        'urgentie', NEW.urgentie,
        'uren_per_week_min', NEW.uren_per_week_min,
        'uren_per_week_max', NEW.uren_per_week_max,
        'start_datum', NEW.start_datum,
        'deadline', NEW.deadline
      ),
      NULL,
      NEW.created_by,
      '{}'::jsonb
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Log status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.system_events (
        event_type,
        entity_type,
        entity_id,
        event_data,
        org_id,
        user_id,
        metadata
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

-- Create trigger for vacancies
DROP TRIGGER IF EXISTS log_vacancy_events_trigger ON public.vacancies;
CREATE TRIGGER log_vacancy_events_trigger
  AFTER INSERT OR UPDATE ON public.vacancies
  FOR EACH ROW
  EXECUTE FUNCTION public.log_vacancy_events();

-- Trigger function for vacancy application events
CREATE OR REPLACE FUNCTION public.log_vacancy_application_events()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.system_events (
      event_type,
      entity_type,
      entity_id,
      event_data,
      org_id,
      user_id,
      metadata
    ) VALUES (
      'professional_matched_to_vacancy',
      'vacancy_application',
      NEW.id,
      jsonb_build_object(
        'vacancy_id', NEW.vacancy_id,
        'professional_id', NEW.professional_id,
        'match_score', NEW.match_score,
        'status', NEW.status
      ),
      NULL,
      auth.uid(),
      '{}'::jsonb
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.system_events (
        event_type,
        entity_type,
        entity_id,
        event_data,
        org_id,
        user_id,
        metadata
      ) VALUES (
        'vacancy_application_status_changed',
        'vacancy_application',
        NEW.id,
        jsonb_build_object(
          'vacancy_id', NEW.vacancy_id,
          'professional_id', NEW.professional_id,
          'old_status', OLD.status,
          'new_status', NEW.status,
          'match_score', NEW.match_score
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

-- Create trigger for vacancy_applications
DROP TRIGGER IF EXISTS log_vacancy_application_events_trigger ON public.vacancy_applications;
CREATE TRIGGER log_vacancy_application_events_trigger
  AFTER INSERT OR UPDATE ON public.vacancy_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.log_vacancy_application_events();