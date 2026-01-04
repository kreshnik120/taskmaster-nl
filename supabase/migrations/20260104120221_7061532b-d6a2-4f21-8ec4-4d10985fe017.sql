
-- Update notify_professional_creation trigger to always create professionals
-- and trigger document collection goals when documents are missing
-- Version: Fase 2 - Versoepelde Document Gate

CREATE OR REPLACE FUNCTION notify_professional_creation()
RETURNS TRIGGER AS $$
DECLARE
  vog_path TEXT;
  diploma_path TEXT;
  vog_valid BOOLEAN := FALSE;
  diploma_valid BOOLEAN := FALSE;
  document_status TEXT;
BEGIN
  -- Only trigger when pipeline_stage changes to 'goedgekeurd' and no professional exists yet
  IF NEW.pipeline_stage = 'goedgekeurd' 
     AND (OLD.pipeline_stage IS NULL OR OLD.pipeline_stage != 'goedgekeurd')
     AND NEW.professional_id IS NULL THEN
    
    -- Check VOG status
    vog_path := NEW.extracted_data->>'vog_file_path';
    IF vog_path IS NOT NULL AND vog_path != '' THEN
      -- Check if VOG is not expired (max 3 months old)
      IF NEW.extracted_data->>'vog_datum' IS NOT NULL THEN
        IF (NEW.extracted_data->>'vog_datum')::date >= (CURRENT_DATE - INTERVAL '3 months') THEN
          vog_valid := TRUE;
        END IF;
      ELSE
        -- VOG exists but no date, mark as valid for now (will be verified)
        vog_valid := TRUE;
      END IF;
    END IF;
    
    -- Check diploma status
    diploma_path := COALESCE(NEW.diploma_file_path, NEW.extracted_data->>'diploma_file_path');
    IF diploma_path IS NOT NULL AND diploma_path != '' THEN
      diploma_valid := TRUE;
    END IF;
    
    -- Determine document status
    IF vog_valid AND diploma_valid THEN
      document_status := 'complete';
    ELSIF vog_valid OR diploma_valid THEN
      document_status := 'partial';
    ELSE
      document_status := 'missing';
    END IF;
    
    -- ALWAYS send notification for professional creation (regardless of document status)
    -- The edge function will handle status assignment and document request goals
    PERFORM pg_notify(
      'professional_creation',
      json_build_object(
        'application_id', NEW.id,
        'org_id', NEW.org_id,
        'candidate_name', COALESCE(NEW.extracted_data->>'naam', 'Onbekend'),
        'has_vog', vog_valid,
        'has_diploma', diploma_valid,
        'document_status', document_status,
        'trigger_source', 'auto_approval_trigger'
      )::text
    );
    
    -- Log system event for AI learning and processing
    INSERT INTO system_events (
      event_type,
      event_data,
      org_id,
      severity,
      source
    ) VALUES (
      'application_approved_for_professional_creation',
      jsonb_build_object(
        'application_id', NEW.id,
        'candidate_name', COALESCE(NEW.extracted_data->>'naam', 'Onbekend'),
        'candidate_email', COALESCE(NEW.email_from, NEW.extracted_data->>'email'),
        'functie_niveau', NEW.extracted_data->>'functie_niveau',
        'werkvorm', NEW.extracted_data->>'werkvorm',
        'has_vog', vog_valid,
        'has_diploma', diploma_valid,
        'document_status', document_status,
        'completeness_score', NEW.completeness_score,
        'requires_document_collection', NOT (vog_valid AND diploma_valid)
      ),
      NEW.org_id,
      'info',
      'database_trigger'
    );
    
    RAISE LOG 'Professional creation triggered for application % (documents: %)', NEW.id, document_status;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure trigger exists on professional_applications
DROP TRIGGER IF EXISTS auto_create_professional_on_approval ON professional_applications;
CREATE TRIGGER auto_create_professional_on_approval
  AFTER UPDATE OF pipeline_stage ON professional_applications
  FOR EACH ROW
  EXECUTE FUNCTION notify_professional_creation();

COMMENT ON FUNCTION notify_professional_creation() IS 
'Fase 2: Versoepelde document gate - triggers professional creation for ALL approved applications, 
regardless of document status. Creates system event with document_status and requires_document_collection 
flag for AI Agent to request missing documents.';
