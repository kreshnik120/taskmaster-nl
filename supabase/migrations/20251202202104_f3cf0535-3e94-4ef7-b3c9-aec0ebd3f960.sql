-- Phase 3C: Add feedback_summary to evaluation events trigger
-- Update the trigger to include anonymized feedback summary

CREATE OR REPLACE FUNCTION public.log_assignment_evaluation()
RETURNS TRIGGER AS $$
DECLARE
  v_assignment RECORD;
  v_org_id UUID;
  v_professional_name TEXT;
  v_client_name TEXT;
  v_sublocation_name TEXT;
  v_functie_niveau TEXT;
  v_werkvorm TEXT;
  v_match_score NUMERIC;
  v_assignment_duration INTEGER;
  v_feedback_summary TEXT;
BEGIN
  -- Get assignment details with related info
  SELECT 
    a.*,
    p.full_name as prof_name,
    p.functie_niveau,
    p.werkvorm,
    cl.naam as client_name,
    cs.naam as sublocation_name,
    co.org_id
  INTO v_assignment
  FROM assignments a
  JOIN professionals p ON p.id = a.professional_id
  JOIN client_sublocations cs ON cs.id = a.sublocation_id
  JOIN client_locations cl ON cl.id = cs.location_id
  JOIN client_organizations co ON co.id = cl.client_org_id
  WHERE a.id = NEW.assignment_id;

  IF v_assignment IS NULL THEN
    RAISE WARNING 'Assignment not found for evaluation: %', NEW.assignment_id;
    RETURN NEW;
  END IF;

  v_org_id := v_assignment.org_id;
  v_professional_name := v_assignment.prof_name;
  v_functie_niveau := v_assignment.functie_niveau;
  v_werkvorm := v_assignment.werkvorm;
  v_client_name := v_assignment.client_name;
  v_sublocation_name := v_assignment.sublocation_name;
  v_match_score := v_assignment.ai_match_score;
  v_assignment_duration := EXTRACT(DAY FROM (COALESCE(v_assignment.end_date, CURRENT_DATE)::timestamp - v_assignment.start_date::timestamp))::INTEGER;

  -- Create anonymized feedback summary (max 200 chars, no names)
  IF NEW.feedback IS NOT NULL AND LENGTH(NEW.feedback) > 0 THEN
    v_feedback_summary := LEFT(
      regexp_replace(
        regexp_replace(NEW.feedback, '[A-Z][a-z]+\s+[A-Z][a-z]+', '[naam]', 'g'),
        '\d{6,}', '[nummer]', 'g'
      ),
      200
    );
  END IF;

  -- Log to system_events
  INSERT INTO system_events (
    org_id,
    user_id,
    event_type,
    entity_type,
    entity_id,
    event_data,
    metadata
  ) VALUES (
    v_org_id,
    NEW.evaluator_id,
    'assignment_evaluation_created',
    'assignment_evaluation',
    NEW.id,
    jsonb_build_object(
      'rating', NEW.rating,
      'would_rehire', NEW.would_rehire,
      'has_feedback', NEW.feedback IS NOT NULL AND LENGTH(NEW.feedback) > 0,
      'feedback_length', COALESCE(LENGTH(NEW.feedback), 0),
      'feedback_summary', v_feedback_summary
    ),
    jsonb_build_object(
      'assignment_id', NEW.assignment_id,
      'professional_name', v_professional_name,
      'client_name', v_client_name,
      'sublocation_name', v_sublocation_name,
      'functie_niveau', v_functie_niveau,
      'werkvorm', v_werkvorm,
      'ai_match_score', v_match_score,
      'assignment_duration_days', v_assignment_duration,
      'is_successful_placement', NEW.rating >= 4 AND NEW.would_rehire = true,
      'is_failed_placement', NEW.rating <= 2,
      'match_score_predicted_correctly', CASE 
        WHEN v_match_score >= 70 AND NEW.rating >= 4 THEN true
        WHEN v_match_score >= 50 AND v_match_score < 70 AND NEW.rating >= 3 AND NEW.rating <= 4 THEN true
        WHEN v_match_score < 50 AND NEW.rating <= 3 THEN true
        ELSE false
      END,
      'rating_vs_match_correlation', CASE 
        WHEN v_match_score IS NOT NULL THEN ROUND(NEW.rating * 20 - v_match_score)
        ELSE NULL
      END
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in log_assignment_evaluation trigger: % - %', SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Also add pattern_occurrence_count column to ai_knowledge_base if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ai_knowledge_base' 
    AND column_name = 'occurrence_count'
  ) THEN
    ALTER TABLE ai_knowledge_base ADD COLUMN occurrence_count INTEGER DEFAULT 1;
  END IF;
END $$;