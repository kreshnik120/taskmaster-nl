-- Herstel log_recruitment_events() functie met correcte kolommen
-- Fix voor: null value in column "entity_type" violates not-null constraint

CREATE OR REPLACE FUNCTION public.log_recruitment_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  event_type_name text;
  event_data_json jsonb;
  metadata_json jsonb;
  event_user_id uuid;
BEGIN
  event_user_id := auth.uid();
  
  -- professional_applications
  IF TG_TABLE_NAME = 'professional_applications' THEN
    IF TG_OP = 'INSERT' THEN
      event_type_name := 'application_created';
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.pipeline_stage IS DISTINCT FROM NEW.pipeline_stage THEN
        event_type_name := 'application_stage_changed';
      ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
        event_type_name := 'application_status_changed';
      ELSE
        event_type_name := 'application_updated';
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      event_type_name := 'application_deleted';
    END IF;

    event_data_json := to_jsonb(NEW);
    metadata_json := jsonb_build_object('operation', TG_OP, 'table', TG_TABLE_NAME);

    IF TG_OP = 'UPDATE' THEN
      metadata_json := metadata_json || jsonb_build_object(
        'old_values', jsonb_build_object(
          'status', OLD.status,
          'pipeline_stage', OLD.pipeline_stage,
          'completeness_score', OLD.completeness_score
        ),
        'new_values', jsonb_build_object(
          'status', NEW.status,
          'pipeline_stage', NEW.pipeline_stage,
          'completeness_score', NEW.completeness_score
        )
      );
    END IF;

  -- professional_client_matches (voor plaatsingen)
  ELSIF TG_TABLE_NAME = 'professional_client_matches' THEN
    IF TG_OP = 'INSERT' THEN
      event_type_name := 'placement_created';
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        event_type_name := 'placement_status_changed';
      ELSE
        event_type_name := 'placement_updated';
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      event_type_name := 'placement_deleted';
    END IF;

    event_data_json := to_jsonb(NEW);
    metadata_json := jsonb_build_object(
      'operation', TG_OP,
      'table', TG_TABLE_NAME,
      'professional_id', NEW.professional_id,
      'client_id', NEW.client_id
    );

    IF TG_OP = 'UPDATE' THEN
      metadata_json := metadata_json || jsonb_build_object(
        'old_values', jsonb_build_object('status', OLD.status),
        'new_values', jsonb_build_object('status', NEW.status)
      );
    END IF;

  -- professional_clients (legacy)
  ELSIF TG_TABLE_NAME = 'professional_clients' THEN
    IF TG_OP = 'INSERT' THEN
      event_type_name := 'placement_created';
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
        event_type_name := 'placement_status_changed';
      ELSE
        event_type_name := 'placement_updated';
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      event_type_name := 'placement_deleted';
    END IF;

    event_data_json := to_jsonb(NEW);
    metadata_json := jsonb_build_object('operation', TG_OP, 'table', TG_TABLE_NAME);

    IF TG_OP = 'UPDATE' THEN
      metadata_json := metadata_json || jsonb_build_object(
        'old_values', jsonb_build_object('is_active', OLD.is_active, 'end_date', OLD.end_date),
        'new_values', jsonb_build_object('is_active', NEW.is_active, 'end_date', NEW.end_date)
      );
    END IF;

  ELSE
    -- Fallback
    IF TG_OP = 'INSERT' THEN
      event_type_name := TG_TABLE_NAME || '_created';
    ELSIF TG_OP = 'UPDATE' THEN
      event_type_name := TG_TABLE_NAME || '_updated';
    ELSIF TG_OP = 'DELETE' THEN
      event_type_name := TG_TABLE_NAME || '_deleted';
    END IF;

    event_data_json := to_jsonb(NEW);
    metadata_json := jsonb_build_object('operation', TG_OP, 'table', TG_TABLE_NAME);
  END IF;

  -- INSERT met alle verplichte kolommen (entity_type, entity_id, event_data)
  INSERT INTO public.system_events (
    org_id, 
    user_id, 
    event_type, 
    entity_type,
    entity_id,
    event_data,
    metadata
  )
  VALUES (
    NEW.org_id,
    event_user_id,
    event_type_name,
    TG_TABLE_NAME,
    NEW.id,
    event_data_json,
    metadata_json
  );

  RETURN NEW;
END;
$function$;

-- Zorg dat trigger voor professional_client_matches bestaat
DROP TRIGGER IF EXISTS log_placement_events ON public.professional_client_matches;
CREATE TRIGGER log_placement_events
AFTER INSERT OR UPDATE ON public.professional_client_matches
FOR EACH ROW EXECUTE FUNCTION public.log_recruitment_events();