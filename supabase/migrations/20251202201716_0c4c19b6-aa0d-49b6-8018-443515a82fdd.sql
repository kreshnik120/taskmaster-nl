-- Fase 3A: Database Performance Indices (corrected)

-- Index op assignment_evaluations voor snellere joins
CREATE INDEX IF NOT EXISTS idx_assignment_evaluations_assignment_id 
ON public.assignment_evaluations(assignment_id);

-- Index op system_events voor event_type filtering (AI processing)
CREATE INDEX IF NOT EXISTS idx_system_events_event_type 
ON public.system_events(event_type);

-- Compound index voor snellere event queries
CREATE INDEX IF NOT EXISTS idx_system_events_org_type_created 
ON public.system_events(org_id, event_type, created_at DESC);

-- Update trigger met error handling
CREATE OR REPLACE FUNCTION public.log_assignment_evaluation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  assignment_data RECORD;
  professional_data RECORD;
  sublocation_data RECORD;
  event_data JSONB;
  v_org_id UUID;
BEGIN
  -- Wrap in exception handling for robustness
  BEGIN
    -- Fetch assignment details
    SELECT a.*, 
           a.ai_match_score,
           a.professional_id,
           a.sublocation_id
    INTO assignment_data
    FROM assignments a
    WHERE a.id = NEW.assignment_id;

    -- Fetch professional details
    SELECT p.full_name, p.functie_niveau, p.werkvorm, p.org_id
    INTO professional_data
    FROM professionals p
    WHERE p.id = assignment_data.professional_id;

    v_org_id := professional_data.org_id;

    -- Fetch sublocation details
    SELECT cs.naam, cs.sector, cs.doelgroep,
           cl.naam as location_naam,
           co.name as org_name
    INTO sublocation_data
    FROM client_sublocations cs
    LEFT JOIN client_locations cl ON cs.location_id = cl.id
    LEFT JOIN client_organizations co ON cl.client_org_id = co.id
    WHERE cs.id = assignment_data.sublocation_id;

    -- Build comprehensive event data
    event_data := jsonb_build_object(
      'evaluation_id', NEW.id,
      'assignment_id', NEW.assignment_id,
      'rating', NEW.rating,
      'feedback_length', COALESCE(LENGTH(NEW.feedback), 0),
      'has_feedback', NEW.feedback IS NOT NULL AND LENGTH(NEW.feedback) > 0,
      'would_rehire', NEW.would_rehire,
      'evaluator_id', NEW.evaluator_id,
      -- Match score correlation
      'ai_match_score', assignment_data.ai_match_score,
      'rating_vs_match_correlation', CASE 
        WHEN assignment_data.ai_match_score IS NOT NULL THEN
          ROUND((NEW.rating::NUMERIC / 5.0) * 100 - assignment_data.ai_match_score, 2)
        ELSE NULL
      END,
      'match_score_predicted_correctly', CASE
        WHEN assignment_data.ai_match_score IS NOT NULL THEN
          (assignment_data.ai_match_score >= 70 AND NEW.rating >= 4) OR
          (assignment_data.ai_match_score < 70 AND NEW.rating < 4)
        ELSE NULL
      END,
      -- Professional context
      'professional_id', assignment_data.professional_id,
      'professional_name', professional_data.full_name,
      'professional_functie', professional_data.functie_niveau,
      'professional_werkvorm', professional_data.werkvorm,
      -- Client context
      'sublocation_id', assignment_data.sublocation_id,
      'sublocation_naam', sublocation_data.naam,
      'location_naam', sublocation_data.location_naam,
      'organization_naam', sublocation_data.org_name,
      'client_sector', sublocation_data.sector,
      'client_doelgroep', sublocation_data.doelgroep,
      -- Success indicators
      'is_successful_placement', NEW.rating >= 4 AND NEW.would_rehire = true,
      'is_failed_placement', NEW.rating <= 2 OR NEW.would_rehire = false,
      'placement_duration_days', CASE 
        WHEN assignment_data.start_date IS NOT NULL AND assignment_data.end_date IS NOT NULL THEN
          EXTRACT(DAY FROM (assignment_data.end_date::timestamp - assignment_data.start_date::timestamp))
        ELSE NULL
      END
    );

    -- Insert system event
    INSERT INTO public.system_events (
      org_id,
      user_id,
      event_type,
      entity_type,
      entity_id,
      event_data,
      metadata
    ) VALUES (
      v_org_id,
      COALESCE(NEW.evaluator_id, auth.uid()),
      'assignment_evaluation_created',
      'assignment_evaluation',
      NEW.id,
      event_data,
      jsonb_build_object(
        'trigger_version', '2.0',
        'created_at', NOW()
      )
    );

  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't block the evaluation insert
    RAISE WARNING 'log_assignment_evaluation trigger error: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;