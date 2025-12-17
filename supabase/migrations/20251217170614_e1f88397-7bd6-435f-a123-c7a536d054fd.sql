
-- Fix EMREX trigger: diploma_validation_status 'pending' bestaat niet, moet 'missing' zijn
CREATE OR REPLACE FUNCTION trigger_emrex_invitation_on_screening()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when pipeline_stage changes to 'screening'
  -- diploma_validation_status default is 'missing', not 'pending'
  IF NEW.pipeline_stage = 'screening' 
     AND (OLD.pipeline_stage IS NULL OR OLD.pipeline_stage != 'screening')
     AND NEW.diploma_validation_status = 'missing' THEN
    
    -- Create agent goal for EMREX invitation
    INSERT INTO public.agent_goals (
      org_id,
      goal_type,
      goal_description,
      status,
      priority,
      input_data,
      trigger_event
    ) VALUES (
      NEW.org_id,
      'send_emrex_invitation',
      'Stuur EMREX diploma verificatie uitnodiging naar kandidaat',
      'pending',
      7,
      jsonb_build_object(
        'application_id', NEW.id,
        'candidate_email', NEW.email_from,
        'candidate_name', COALESCE(NEW.extracted_data->>'naam', split_part(NEW.email_from, '@', 1)),
        'functie_niveau', NEW.extracted_data->>'functie_niveau'
      ),
      jsonb_build_object(
        'event_type', 'screening_started',
        'application_id', NEW.id,
        'timestamp', now()
      )
    );
    
    -- Log the event
    INSERT INTO public.system_events (
      org_id,
      event_type,
      entity_type,
      entity_id,
      event_data,
      metadata
    ) VALUES (
      NEW.org_id,
      'emrex_invitation_triggered',
      'application',
      NEW.id,
      jsonb_build_object(
        'candidate_email', NEW.email_from,
        'candidate_name', NEW.extracted_data->>'naam',
        'functie_niveau', NEW.extracted_data->>'functie_niveau'
      ),
      jsonb_build_object('trigger', 'trigger_emrex_invitation_on_screening')
    );
    
    RAISE LOG 'Created send_emrex_invitation goal for application %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
