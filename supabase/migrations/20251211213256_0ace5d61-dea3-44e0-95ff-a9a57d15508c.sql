-- =====================================================
-- Phase 3: Auto Create Professional on Approval Trigger
-- =====================================================

-- Create function to call edge function when application is approved
CREATE OR REPLACE FUNCTION public.notify_professional_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload JSONB;
BEGIN
  -- Only trigger when pipeline_stage changes to 'goedgekeurd'
  IF NEW.pipeline_stage = 'goedgekeurd' AND (OLD.pipeline_stage IS NULL OR OLD.pipeline_stage != 'goedgekeurd') THEN
    -- Check if professional already exists for this application
    IF NEW.professional_id IS NULL THEN
      -- Build payload for edge function
      payload := jsonb_build_object(
        'application_id', NEW.id,
        'trigger_source', 'database_trigger'
      );
      
      -- Use pg_notify to trigger external processing
      -- The system will use process-system-events to pick this up
      PERFORM pg_notify('professional_creation', payload::text);
      
      -- Also insert a system event that can be processed by the orchestrator
      INSERT INTO public.system_events (
        event_type,
        entity_type,
        entity_id,
        org_id,
        event_data,
        metadata
      ) VALUES (
        'application_approved_for_professional_creation',
        'professional_application',
        NEW.id,
        NEW.org_id,
        jsonb_build_object(
          'application_id', NEW.id,
          'candidate_name', NEW.extracted_data->>'naam',
          'candidate_email', NEW.email_from,
          'previous_stage', OLD.pipeline_stage,
          'new_stage', NEW.pipeline_stage,
          'completeness_score', NEW.completeness_score
        ),
        '{}'::jsonb
      );
      
      RAISE NOTICE 'Professional creation triggered for application %', NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS auto_create_professional_on_approval ON public.professional_applications;

-- Create the trigger
CREATE TRIGGER auto_create_professional_on_approval
AFTER UPDATE OF pipeline_stage ON public.professional_applications
FOR EACH ROW
WHEN (NEW.pipeline_stage = 'goedgekeurd' AND (OLD.pipeline_stage IS NULL OR OLD.pipeline_stage != 'goedgekeurd'))
EXECUTE FUNCTION public.notify_professional_creation();

-- Add comment for documentation
COMMENT ON TRIGGER auto_create_professional_on_approval ON public.professional_applications IS 
'Phase 3: Automatically triggers professional creation when application is approved (pipeline_stage = goedgekeurd)';