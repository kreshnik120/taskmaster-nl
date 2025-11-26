-- Fix log_recruitment_events functie: verwijder created_by referentie
-- en gebruik alleen auth.uid() voor user_id tracking

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
  -- Bepaal user_id: alleen auth.uid(), geen fallback naar niet-bestaand veld
  event_user_id := auth.uid();
  
  -- Bepaal event type
  IF TG_OP = 'INSERT' THEN
    event_type_name := TG_TABLE_NAME || '_created';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check specifieke status changes
    IF TG_TABLE_NAME = 'professional_applications' AND OLD.pipeline_stage IS DISTINCT FROM NEW.pipeline_stage THEN
      event_type_name := 'application_stage_changed';
    ELSIF TG_TABLE_NAME = 'professional_applications' AND OLD.status IS DISTINCT FROM NEW.status THEN
      event_type_name := 'application_status_changed';
    ELSIF TG_TABLE_NAME = 'professional_clients' AND OLD.is_active IS DISTINCT FROM NEW.is_active THEN
      event_type_name := 'placement_status_changed';
    ELSE
      event_type_name := TG_TABLE_NAME || '_updated';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    event_type_name := TG_TABLE_NAME || '_deleted';
  END IF;

  -- Build event data
  event_data_json := to_jsonb(NEW);
  
  -- Build metadata met old/new vergelijking
  metadata_json := jsonb_build_object(
    'operation', TG_OP,
    'table', TG_TABLE_NAME
  );

  IF TG_OP = 'UPDATE' THEN
    metadata_json := metadata_json || jsonb_build_object(
      'old_values', CASE 
        WHEN TG_TABLE_NAME = 'professional_applications' THEN 
          jsonb_build_object(
            'status', OLD.status,
            'pipeline_stage', OLD.pipeline_stage,
            'completeness_score', OLD.completeness_score
          )
        WHEN TG_TABLE_NAME = 'professional_clients' THEN
          jsonb_build_object(
            'is_active', OLD.is_active,
            'end_date', OLD.end_date
          )
        ELSE '{}'::jsonb
      END,
      'new_values', CASE 
        WHEN TG_TABLE_NAME = 'professional_applications' THEN 
          jsonb_build_object(
            'status', NEW.status,
            'pipeline_stage', NEW.pipeline_stage,
            'completeness_score', NEW.completeness_score
          )
        WHEN TG_TABLE_NAME = 'professional_clients' THEN
          jsonb_build_object(
            'is_active', NEW.is_active,
            'end_date', NEW.end_date
          )
        ELSE '{}'::jsonb
      END
    );
  END IF;

  -- Insert event naar system_events (user_id mag NULL zijn)
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
    event_user_id,  -- Alleen auth.uid(), geen fallback
    event_type_name,
    TG_TABLE_NAME,
    NEW.id,
    event_data_json,
    metadata_json
  );

  RETURN NEW;
END;
$function$;