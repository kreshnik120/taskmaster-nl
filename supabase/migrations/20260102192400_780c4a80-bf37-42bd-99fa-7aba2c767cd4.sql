-- Fix: Update create_human_review_on_low_confidence() om ook global_confidence te checken
-- Dit lost de mismatch op tussen extract-cv-data (global_confidence) en de trigger (overall_confidence)

CREATE OR REPLACE FUNCTION public.create_human_review_on_low_confidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_confidence NUMERIC;
  v_review_id UUID;
  v_rejection_reason TEXT;
BEGIN
  -- Only trigger when moving TO 'afgewezen' stage
  IF NEW.pipeline_stage = 'afgewezen' AND (OLD.pipeline_stage IS NULL OR OLD.pipeline_stage != 'afgewezen') THEN
    v_org_id := NEW.org_id;
    
    -- Check ALL possible confidence fields (fixes mismatch between extract-cv-data and trigger)
    v_confidence := COALESCE(
      (NEW.extracted_data->>'overall_confidence')::NUMERIC,
      (NEW.extracted_data->>'confidence_score')::NUMERIC,
      (NEW.extracted_data->>'global_confidence')::NUMERIC,
      0.5
    );
    
    -- Get rejection reason if available
    v_rejection_reason := COALESCE(
      NEW.extracted_data->>'rejection_reason',
      NEW.extracted_data->>'afwijzing_reden',
      'Automatische afwijzing door AI'
    );
    
    -- If confidence is below threshold, block rejection and create human review
    IF v_confidence < 0.7 THEN
      -- Create human review item
      INSERT INTO public.human_review_queue (
        application_id,
        org_id,
        review_type,
        priority,
        ai_recommendation,
        ai_confidence,
        context_data,
        status
      ) VALUES (
        NEW.id,
        v_org_id,
        'low_confidence_rejection',
        CASE 
          WHEN v_confidence < 0.3 THEN 'critical'
          WHEN v_confidence < 0.5 THEN 'high'
          ELSE 'medium'
        END,
        'afwijzen',
        v_confidence,
        jsonb_build_object(
          'original_stage', OLD.pipeline_stage,
          'attempted_stage', NEW.pipeline_stage,
          'rejection_reason', v_rejection_reason,
          'completeness_score', NEW.completeness_score,
          'extracted_data_summary', jsonb_build_object(
            'naam', NEW.extracted_data->>'naam',
            'functie_niveau', NEW.extracted_data->>'functie_niveau',
            'werkvorm', NEW.extracted_data->>'werkvorm'
          )
        ),
        'pending'
      ) RETURNING id INTO v_review_id;
      
      -- Block the rejection - revert to previous stage and mark for review
      NEW.pipeline_stage := COALESCE(OLD.pipeline_stage, 'nieuw');
      NEW.pending_human_review := true;
      NEW.last_review_id := v_review_id;
      
      -- Log the intervention
      RAISE LOG 'Human review created for application % - confidence % < 0.7, review_id: %', 
        NEW.id, v_confidence, v_review_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;