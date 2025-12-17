-- Fix bug: vog_validation_details bestaat niet, moet vog_verification_response zijn
CREATE OR REPLACE FUNCTION public.create_vog_rejection_goal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only trigger when vog_validation_status changes to a rejection status
  IF NEW.vog_validation_status IN ('authentic_fail', 'expired', 'format_error') 
     AND (OLD.vog_validation_status IS NULL OR OLD.vog_validation_status NOT IN ('authentic_fail', 'expired', 'format_error')) THEN
    
    -- Create agent goal for VOG rejection handling
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
      'request_new_vog',
      'Vraag kandidaat om nieuw VOG document vanwege: ' || NEW.vog_validation_status,
      'pending',
      8,
      jsonb_build_object(
        'application_id', NEW.id,
        'candidate_email', NEW.email_from,
        'candidate_name', COALESCE(NEW.extracted_data->>'naam', split_part(NEW.email_from, '@', 1)),
        'rejection_reason', NEW.vog_validation_status,
        'vog_details', NEW.vog_verification_response
      ),
      jsonb_build_object(
        'event_type', 'vog_rejected',
        'application_id', NEW.id,
        'timestamp', now()
      )
    );
    
    RAISE LOG 'Created request_new_vog goal for application %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;