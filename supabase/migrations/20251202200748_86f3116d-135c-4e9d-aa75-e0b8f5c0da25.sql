-- Drop existing trigger with correct name (CASCADE for function)
DROP TRIGGER IF EXISTS trigger_log_assignment_evaluation ON assignment_evaluations;
DROP FUNCTION IF EXISTS log_assignment_evaluation() CASCADE;

-- Create enhanced trigger function with match_score correlation data
CREATE OR REPLACE FUNCTION public.log_assignment_evaluation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_match_score NUMERIC;
  v_professional_name TEXT;
  v_sublocation_name TEXT;
  v_client_name TEXT;
  v_functie_niveau TEXT;
  v_werkvorm TEXT;
  v_assignment_duration_days INTEGER;
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  -- Get comprehensive assignment context
  SELECT 
    p.org_id,
    a.ai_match_score,
    p.full_name,
    cs.naam,
    co.name,
    p.functie_niveau,
    p.werkvorm,
    a.start_date::date,
    COALESCE(a.end_date::date, a.completed_at::date, CURRENT_DATE)
  INTO 
    v_org_id,
    v_match_score,
    v_professional_name,
    v_sublocation_name,
    v_client_name,
    v_functie_niveau,
    v_werkvorm,
    v_start_date,
    v_end_date
  FROM assignments a
  JOIN professionals p ON p.id = a.professional_id
  JOIN client_sublocations cs ON cs.id = a.sublocation_id
  JOIN client_locations cl ON cl.id = cs.location_id
  JOIN client_organizations co ON co.id = cl.client_org_id
  WHERE a.id = NEW.assignment_id;

  -- Calculate duration
  v_assignment_duration_days := v_end_date - v_start_date;

  -- Log rich event for AI learning with correlation data
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
    NEW.evaluator_id,
    'assignment_evaluation_created',
    'assignment_evaluation',
    NEW.id,
    jsonb_build_object(
      'assignment_id', NEW.assignment_id,
      'rating', NEW.rating,
      'would_rehire', NEW.would_rehire,
      'has_feedback', NEW.feedback IS NOT NULL AND NEW.feedback != '',
      'feedback_length', COALESCE(LENGTH(NEW.feedback), 0)
    ),
    jsonb_build_object(
      'ai_match_score', v_match_score,
      'rating_vs_match_correlation', CASE 
        WHEN v_match_score IS NOT NULL THEN 
          ROUND((NEW.rating * 20) - v_match_score, 2)
        ELSE NULL
      END,
      'match_score_predicted_correctly', CASE
        WHEN v_match_score IS NOT NULL THEN
          (NEW.rating >= 4 AND v_match_score >= 70) OR 
          (NEW.rating <= 2 AND v_match_score < 50) OR
          (NEW.rating = 3 AND v_match_score BETWEEN 50 AND 69)
        ELSE NULL
      END,
      'professional_name', v_professional_name,
      'sublocation_name', v_sublocation_name,
      'client_name', v_client_name,
      'functie_niveau', v_functie_niveau,
      'werkvorm', v_werkvorm,
      'assignment_duration_days', v_assignment_duration_days,
      'start_date', v_start_date,
      'end_date', v_end_date,
      'is_successful_placement', NEW.rating >= 4 AND COALESCE(NEW.would_rehire, true),
      'is_failed_placement', NEW.rating <= 2 OR NOT COALESCE(NEW.would_rehire, true)
    )
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trigger_log_assignment_evaluation
  AFTER INSERT ON assignment_evaluations
  FOR EACH ROW
  EXECUTE FUNCTION log_assignment_evaluation();