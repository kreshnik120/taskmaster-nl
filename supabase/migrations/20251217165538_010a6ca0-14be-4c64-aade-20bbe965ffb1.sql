-- Fix search_path for VOG trigger function
CREATE OR REPLACE FUNCTION auto_verify_vog_on_upload()
RETURNS TRIGGER AS $$
DECLARE
  old_vog_path TEXT;
  new_vog_path TEXT;
  supabase_url TEXT := 'https://oelmsmcgryeoryhonexw.supabase.co';
BEGIN
  -- Get old and new VOG file paths
  old_vog_path := COALESCE(OLD.extracted_data->>'vog_file_path', '');
  new_vog_path := COALESCE(NEW.extracted_data->>'vog_file_path', '');
  
  -- Only trigger if VOG file path was added or changed
  IF new_vog_path != '' AND new_vog_path != old_vog_path THEN
    -- Set status to pending verification
    NEW.vog_validation_status := 'pending';
    
    -- Queue async HTTP call to verify-vog-gaav edge function using pg_net
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/verify-vog-gaav',
      body := jsonb_build_object(
        'application_id', NEW.id,
        'vog_file_path', new_vog_path,
        'auto_triggered', true
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      )
    );
    
    -- Log the auto-trigger event
    INSERT INTO public.system_events (
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net;