-- =====================================================
-- EXPERT PANEL FLOW: Update trigger voor document-check
-- Professional creation alleen na documenten compleet
-- =====================================================

-- Drop de oude trigger
DROP TRIGGER IF EXISTS auto_create_professional_on_approval ON public.professional_applications;

-- Update de functie om documenten te checken
CREATE OR REPLACE FUNCTION public.notify_professional_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  payload JSONB;
  vog_path TEXT;
  diploma_path TEXT;
  vog_date_str TEXT;
  vog_date DATE;
  vog_is_valid BOOLEAN := false;
BEGIN
  -- Only trigger when pipeline_stage changes to 'goedgekeurd'
  IF NEW.pipeline_stage = 'goedgekeurd' AND (OLD.pipeline_stage IS NULL OR OLD.pipeline_stage != 'goedgekeurd') THEN
    -- Check if professional already exists for this application
    IF NEW.professional_id IS NULL THEN
      
      -- EXPERT PANEL GUARDRAIL: Check document completeness
      vog_path := NEW.extracted_data->>'vog_file_path';
      diploma_path := NEW.extracted_data->>'diploma_file_path';
      vog_date_str := NEW.extracted_data->>'vog_date';
      
      -- Check VOG validity (max 3 months old)
      IF vog_date_str IS NOT NULL THEN
        BEGIN
          vog_date := vog_date_str::DATE;
          vog_is_valid := (vog_date >= (CURRENT_DATE - INTERVAL '3 months'));
        EXCEPTION WHEN OTHERS THEN
          vog_is_valid := false;
        END;
      END IF;
      
      -- Only proceed if VOG is present AND valid, AND diploma is present
      IF vog_path IS NOT NULL AND vog_is_valid AND diploma_path IS NOT NULL THEN
        -- Build payload for edge function
        payload := jsonb_build_object(
          'application_id', NEW.id,
          'trigger_source', 'database_trigger',
          'documents_verified', true
        );
        
        -- Use pg_notify to trigger external processing
        PERFORM pg_notify('professional_creation', payload::text);
        
        -- Insert system event for professional creation
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
            'completeness_score', NEW.completeness_score,
            'vog_valid', vog_is_valid,
            'diploma_present', diploma_path IS NOT NULL
          ),
          '{}'::jsonb
        );
        
        RAISE NOTICE 'Professional creation triggered for application % (documents verified)', NEW.id;
      ELSE
        -- Documents not complete - log but don't create professional
        INSERT INTO public.system_events (
          event_type,
          entity_type,
          entity_id,
          org_id,
          event_data,
          metadata
        ) VALUES (
          'professional_creation_blocked_missing_documents',
          'professional_application',
          NEW.id,
          NEW.org_id,
          jsonb_build_object(
            'application_id', NEW.id,
            'candidate_name', NEW.extracted_data->>'naam',
            'reason', 'Documents incomplete',
            'vog_present', vog_path IS NOT NULL,
            'vog_valid', vog_is_valid,
            'diploma_present', diploma_path IS NOT NULL
          ),
          '{}'::jsonb
        );
        
        RAISE NOTICE 'Professional creation BLOCKED for application % - documents incomplete (VOG: %, valid: %, Diploma: %)', 
          NEW.id, 
          vog_path IS NOT NULL, 
          vog_is_valid,
          diploma_path IS NOT NULL;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Recreate trigger
CREATE TRIGGER auto_create_professional_on_approval 
  AFTER UPDATE OF pipeline_stage ON public.professional_applications 
  FOR EACH ROW 
  WHEN ((new.pipeline_stage = 'goedgekeurd'::text) AND ((old.pipeline_stage IS NULL) OR (old.pipeline_stage <> 'goedgekeurd'::text))) 
  EXECUTE FUNCTION notify_professional_creation();

-- Add comment for documentation
COMMENT ON FUNCTION public.notify_professional_creation() IS 
'Expert Panel Flow: Triggers professional creation ONLY when pipeline_stage becomes goedgekeurd AND documents (VOG ≤3 months, diploma) are complete.';