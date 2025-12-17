
-- =====================================================
-- FASE 1: Consolideer Dubbele Application INSERT Triggers
-- =====================================================
-- Probleem: 3 triggers op INSERT maken potentieel 3 goals (2x application_intake_completion, 1x send_welcome_email)
-- Oplossing: Verwijder redundante trigger, behoud 1 intake trigger + 1 welcome trigger

-- STAP 1: Verwijder de redundante intake trigger
-- (auto_intake_followup en on_application_intake_incomplete doen beide hetzelfde)
DROP TRIGGER IF EXISTS on_application_intake_incomplete ON professional_applications;
DROP FUNCTION IF EXISTS trigger_application_intake_goal();

-- STAP 2: Verbeter trigger_intake_followup_goal met betere deduplicatie
-- Deze functie handelt nu alle intake completion goals
CREATE OR REPLACE FUNCTION trigger_intake_followup_goal()
RETURNS TRIGGER AS $$
DECLARE
  existing_goal_count INTEGER;
  v_candidate_name TEXT;
BEGIN
  -- Skip if completeness is already >= 80% or no email available
  IF NEW.completeness_score IS NULL 
     OR NEW.completeness_score >= 80 
     OR NEW.email_from IS NULL 
     OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Extract candidate name
  v_candidate_name := COALESCE(
    NEW.extracted_data->>'naam',
    split_part(NEW.email_from, '@', 1),
    'Kandidaat'
  );
  
  -- Check if there's already an active goal for this application (ANY goal type to prevent racing)
  SELECT COUNT(*) INTO existing_goal_count
  FROM public.agent_goals 
  WHERE input_data->>'application_id' = NEW.id::text
    AND goal_type IN ('application_intake_completion', 'send_welcome_email', 'send_welcome_and_intake')
    AND status IN ('pending', 'planning', 'executing', 'in_progress');
  
  -- Only create if no existing active goal
  IF existing_goal_count = 0 THEN
    INSERT INTO public.agent_goals (
      org_id,
      goal_type,
      goal_description,
      status,
      priority,
      input_data
    ) VALUES (
      COALESCE(NEW.org_id, '650e8400-e29b-41d4-a716-446655440001'::uuid),
      'application_intake_completion',
      'Verzamel ontbrekende informatie voor ' || v_candidate_name,
      'pending',
      100 - COALESCE(NEW.completeness_score, 0),
      jsonb_build_object(
        'application_id', NEW.id,
        'candidate_email', NEW.email_from,
        'candidate_name', v_candidate_name,
        'missing_info', COALESCE(NEW.missing_info, '[]'::jsonb),
        'current_completeness', NEW.completeness_score,
        'triggered_by', 'consolidated_intake_trigger',
        'triggered_at', NOW()
      )
    );
    
    RAISE LOG 'Created intake_completion goal for application % (completeness: %)', NEW.id, NEW.completeness_score;
  ELSE
    RAISE LOG 'Skipped intake goal - existing active goal found for application %', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- STAP 3: Verbeter welcome trigger om ook intake vragen te checken
CREATE OR REPLACE FUNCTION trigger_welcome_on_new_application()
RETURNS TRIGGER AS $$
DECLARE
  v_candidate_name TEXT;
  v_missing_info TEXT[];
  existing_goal_count INTEGER;
BEGIN
  -- Check of er al een goal bestaat (voorkom race conditions met intake trigger)
  SELECT COUNT(*) INTO existing_goal_count
  FROM public.agent_goals 
  WHERE input_data->>'application_id' = NEW.id::text
    AND goal_type IN ('send_welcome_email', 'send_welcome_and_intake', 'application_intake_completion')
    AND status IN ('pending', 'planning', 'executing', 'in_progress');
  
  IF existing_goal_count > 0 THEN
    RAISE LOG 'Skipped welcome goal - existing goal found for application %', NEW.id;
    RETURN NEW;
  END IF;
  
  -- Extract candidate name
  v_candidate_name := COALESCE(
    NEW.extracted_data->>'naam',
    split_part(NEW.email_from, '@', 1),
    'Beste sollicitant'
  );
  
  -- Build missing info list
  v_missing_info := ARRAY[]::TEXT[];
  IF NEW.extracted_data->>'functie_niveau' IS NULL THEN
    v_missing_info := array_append(v_missing_info, 'functie_niveau');
  END IF;
  IF NEW.extracted_data->>'werkvorm' IS NULL THEN
    v_missing_info := array_append(v_missing_info, 'werkvorm');
  END IF;
  IF NEW.extracted_data->>'regio' IS NULL THEN
    v_missing_info := array_append(v_missing_info, 'regio');
  END IF;
  IF NEW.extracted_data->>'beschikbaarheid' IS NULL THEN
    v_missing_info := array_append(v_missing_info, 'beschikbaarheid');
  END IF;
  IF NEW.extracted_data->>'telefoonnummer' IS NULL THEN
    v_missing_info := array_append(v_missing_info, 'telefoonnummer');
  END IF;
  
  -- Create welkom email goal (includes intake questions if needed)
  INSERT INTO public.agent_goals (
    org_id,
    goal_type,
    goal_description,
    status,
    priority,
    input_data
  ) VALUES (
    COALESCE(NEW.org_id, '650e8400-e29b-41d4-a716-446655440001'::uuid),
    'send_welcome_email',
    'Welkomstmail voor ' || v_candidate_name,
    'pending',
    100,
    jsonb_build_object(
      'application_id', NEW.id,
      'candidate_email', NEW.email_from,
      'candidate_name', v_candidate_name,
      'missing_info', v_missing_info,
      'current_completeness', NEW.completeness_score,
      'include_intake_questions', (array_length(v_missing_info, 1) > 0)
    )
  );
  
  RAISE LOG 'Created welcome_email goal for application %', NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- STAP 4: Ensure auto_intake_followup only fires on UPDATE (not INSERT)
-- to prevent racing with welcome trigger
DROP TRIGGER IF EXISTS auto_intake_followup ON professional_applications;
CREATE TRIGGER auto_intake_followup 
  AFTER UPDATE OF completeness_score ON professional_applications
  FOR EACH ROW 
  WHEN (OLD.completeness_score IS DISTINCT FROM NEW.completeness_score)
  EXECUTE FUNCTION trigger_intake_followup_goal();
