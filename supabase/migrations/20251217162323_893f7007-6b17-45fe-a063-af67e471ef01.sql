
-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to auto-trigger VOG verification when VOG file is uploaded
CREATE OR REPLACE FUNCTION public.auto_verify_vog_on_upload()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_vog_path TEXT;
  new_vog_path TEXT;
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Get old and new VOG file paths
  old_vog_path := COALESCE(OLD.extracted_data->>'vog_file_path', '');
  new_vog_path := COALESCE(NEW.extracted_data->>'vog_file_path', '');
  
  -- Only trigger if VOG file path was added or changed
  IF new_vog_path != '' AND new_vog_path != old_vog_path THEN
    -- Set status to pending verification
    NEW.vog_validation_status := 'pending';
    
    -- Get Supabase URL from environment
    supabase_url := current_setting('app.settings.supabase_url', true);
    
    -- If URL not set, try to construct it
    IF supabase_url IS NULL OR supabase_url = '' THEN
      supabase_url := 'https://oelmsmcgryeoryhonexw.supabase.co';
    END IF;
    
    -- Queue async HTTP call to verify-vog-gaav edge function
    PERFORM extensions.http_post(
      url := supabase_url || '/functions/v1/verify-vog-gaav',
      body := json_build_object(
        'application_id', NEW.id,
        'vog_file_path', new_vog_path,
        'auto_triggered', true
      )::text,
      headers := json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      )::jsonb
    );
    
    -- Log the auto-trigger event
    INSERT INTO system_events (
      org_id,
      event_type,
      entity_type,
      entity_id,
      event_data,
      metadata
    ) VALUES (
      NEW.org_id,
      'vog_auto_verification_triggered',
      'application',
      NEW.id,
      jsonb_build_object(
        'vog_file_path', new_vog_path,
        'previous_path', old_vog_path
      ),
      jsonb_build_object('trigger', 'auto_verify_vog_on_upload')
    );
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't block the update
    RAISE WARNING 'VOG auto-verification trigger failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger for VOG upload detection
DROP TRIGGER IF EXISTS trigger_auto_vog_verification ON professional_applications;
CREATE TRIGGER trigger_auto_vog_verification
  BEFORE UPDATE ON professional_applications
  FOR EACH ROW
  EXECUTE FUNCTION auto_verify_vog_on_upload();

-- Function to create AI agent goal when VOG verification fails
CREATE OR REPLACE FUNCTION public.create_vog_rejection_goal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate_name TEXT;
  candidate_email TEXT;
BEGIN
  -- Only trigger when VOG status changes to a rejection status
  IF NEW.vog_validation_status IN ('authentic_fail', 'expired', 'format_error') 
     AND (OLD.vog_validation_status IS NULL OR OLD.vog_validation_status NOT IN ('authentic_fail', 'expired', 'format_error')) THEN
    
    -- Get candidate info
    candidate_name := COALESCE(NEW.extracted_data->>'naam', NEW.extracted_data->>'full_name', 'Kandidaat');
    candidate_email := COALESCE(NEW.email_from, NEW.extracted_data->>'email', '');
    
    -- Create AI agent goal to request new VOG
    INSERT INTO agent_goals (
      org_id,
      goal_type,
      goal_description,
      priority,
      status,
      input_data,
      trigger_event
    ) VALUES (
      NEW.org_id,
      'request_new_vog',
      'Vraag nieuwe VOG aan bij ' || candidate_name || ' - huidige VOG is ' || 
        CASE NEW.vog_validation_status 
          WHEN 'authentic_fail' THEN 'niet authentiek bevonden'
          WHEN 'expired' THEN 'verlopen (ouder dan 3 maanden)'
          WHEN 'format_error' THEN 'niet leesbaar'
        END,
      80, -- High priority
      'pending',
      jsonb_build_object(
        'application_id', NEW.id,
        'candidate_name', candidate_name,
        'candidate_email', candidate_email,
        'rejection_reason', NEW.vog_validation_status,
        'vog_validation_details', NEW.vog_validation_details,
        'action_type', 'send_vog_rejection_email'
      ),
      jsonb_build_object(
        'event_type', 'vog_verification_failed',
        'triggered_at', NOW(),
        'previous_status', OLD.vog_validation_status
      )
    );
    
    -- Log the goal creation
    INSERT INTO system_events (
      org_id,
      event_type,
      entity_type,
      entity_id,
      event_data,
      metadata
    ) VALUES (
      NEW.org_id,
      'vog_rejection_goal_created',
      'application',
      NEW.id,
      jsonb_build_object(
        'rejection_reason', NEW.vog_validation_status,
        'candidate_name', candidate_name,
        'goal_type', 'request_new_vog'
      ),
      jsonb_build_object('trigger', 'create_vog_rejection_goal')
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for VOG rejection goal creation
DROP TRIGGER IF EXISTS trigger_vog_rejection_goal ON professional_applications;
CREATE TRIGGER trigger_vog_rejection_goal
  AFTER UPDATE ON professional_applications
  FOR EACH ROW
  EXECUTE FUNCTION create_vog_rejection_goal();

-- Add comment explaining the automation
COMMENT ON FUNCTION auto_verify_vog_on_upload() IS 'Auto-triggers GAAV VOG verification when vog_file_path is added/changed in extracted_data';
COMMENT ON FUNCTION create_vog_rejection_goal() IS 'Creates AI agent goal to request new VOG when verification fails';
