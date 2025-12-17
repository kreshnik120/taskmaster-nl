-- EMREX Diploma Verificatie: Database support

-- Add diploma_validation_status to professional_applications if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'professional_applications' 
    AND column_name = 'diploma_validation_status'
  ) THEN
    ALTER TABLE public.professional_applications 
    ADD COLUMN diploma_validation_status TEXT DEFAULT 'pending';
  END IF;
END $$;

-- Create trigger function for automatic EMREX invitation
CREATE OR REPLACE FUNCTION public.trigger_emrex_invitation_on_screening()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only trigger when pipeline_stage changes to 'screening'
  IF NEW.pipeline_stage = 'screening' 
     AND (OLD.pipeline_stage IS NULL OR OLD.pipeline_stage != 'screening')
     AND (NEW.diploma_validation_status IS NULL OR NEW.diploma_validation_status = 'pending') THEN
    
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
    
    -- Update status to indicate invitation pending
    NEW.diploma_validation_status := 'invitation_pending';
    
    RAISE LOG 'Created send_emrex_invitation goal for application %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_emrex_on_screening ON public.professional_applications;
CREATE TRIGGER trigger_emrex_on_screening
  BEFORE UPDATE ON public.professional_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_emrex_invitation_on_screening();

-- Create trigger function for EMREX reminder after 48 hours
CREATE OR REPLACE FUNCTION public.check_emrex_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  app RECORD;
BEGIN
  -- Find applications with pending EMREX invitations older than 48 hours
  FOR app IN
    SELECT id, org_id, email_from, extracted_data
    FROM professional_applications
    WHERE diploma_validation_status = 'emrex_invited'
    AND (extracted_data->>'emrex_invited_at')::timestamptz < NOW() - INTERVAL '48 hours'
    AND (extracted_data->>'emrex_reminder_sent_at') IS NULL
  LOOP
    -- Create reminder goal
    INSERT INTO agent_goals (
      org_id,
      goal_type,
      goal_description,
      status,
      priority,
      input_data,
      trigger_event
    ) VALUES (
      app.org_id,
      'send_emrex_reminder',
      'Stuur herinnering voor diploma verificatie',
      'pending',
      6,
      jsonb_build_object(
        'application_id', app.id,
        'candidate_email', app.email_from,
        'candidate_name', COALESCE(app.extracted_data->>'naam', split_part(app.email_from, '@', 1)),
        'original_invitation_at', app.extracted_data->>'emrex_invited_at'
      ),
      jsonb_build_object(
        'event_type', 'emrex_reminder_due',
        'application_id', app.id,
        'timestamp', now()
      )
    );
    
    -- Mark reminder as sent
    UPDATE professional_applications
    SET extracted_data = extracted_data || jsonb_build_object('emrex_reminder_sent_at', now()::text)
    WHERE id = app.id;
    
    RAISE LOG 'Created EMREX reminder for application %', app.id;
  END LOOP;
  
  -- Find applications with no response after 7 days - escalate to recruiter
  FOR app IN
    SELECT id, org_id, email_from, extracted_data
    FROM professional_applications
    WHERE diploma_validation_status = 'emrex_invited'
    AND (extracted_data->>'emrex_invited_at')::timestamptz < NOW() - INTERVAL '7 days'
    AND (extracted_data->>'emrex_escalated_at') IS NULL
  LOOP
    -- Create escalation goal
    INSERT INTO agent_goals (
      org_id,
      goal_type,
      goal_description,
      status,
      priority,
      input_data,
      trigger_event
    ) VALUES (
      app.org_id,
      'escalate_emrex_timeout',
      'EMREX verificatie timeout - escaleer naar recruiter voor handmatige check',
      'pending',
      9,
      jsonb_build_object(
        'application_id', app.id,
        'candidate_email', app.email_from,
        'candidate_name', COALESCE(app.extracted_data->>'naam', split_part(app.email_from, '@', 1)),
        'original_invitation_at', app.extracted_data->>'emrex_invited_at',
        'days_waiting', 7
      ),
      jsonb_build_object(
        'event_type', 'emrex_timeout_escalation',
        'application_id', app.id,
        'timestamp', now()
      )
    );
    
    -- Mark as escalated
    UPDATE professional_applications
    SET 
      diploma_validation_status = 'manual_review_required',
      extracted_data = extracted_data || jsonb_build_object('emrex_escalated_at', now()::text)
    WHERE id = app.id;
    
    RAISE LOG 'Escalated EMREX timeout for application %', app.id;
  END LOOP;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.trigger_emrex_invitation_on_screening() IS 
'Automatically creates EMREX diploma verification invitation when application enters screening stage';

COMMENT ON FUNCTION public.check_emrex_reminders() IS 
'Checks for pending EMREX invitations and creates reminder/escalation goals. Should be called by cron job.';