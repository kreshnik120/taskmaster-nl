-- Fase 3: Automatische welkomstmail trigger bij nieuwe sollicitaties
-- Vervangt de oude intake trigger met een gecombineerde welkomst + intake email

-- Function: Create welcome goal when new application is inserted
CREATE OR REPLACE FUNCTION public.trigger_welcome_on_new_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_name TEXT;
  v_missing_info TEXT[];
  v_org_name TEXT;
BEGIN
  -- Extract candidate name
  v_candidate_name := COALESCE(
    NEW.extracted_data->>'naam',
    split_part(NEW.email_from, '@', 1),
    'Beste sollicitant'
  );
  
  -- Get missing info (critical fields only for first contact)
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
  
  -- Get org name for personalized email
  SELECT CASE 
    WHEN NEW.org_id = '550e8400-e29b-41d4-a716-446655440000' THEN 'ABCzorg'
    ELSE 'CitoZorg'
  END INTO v_org_name;
  
  -- Create welcome goal (will be processed by ai-agent-orchestrator)
  INSERT INTO agent_goals (
    org_id,
    goal_type,
    goal_description,
    status,
    priority,
    input_data
  ) VALUES (
    COALESCE(NEW.org_id, '650e8400-e29b-41d4-a716-446655440001'), -- Default to CitoZorg
    'send_welcome_and_intake',
    format('Stuur welkomstmail naar %s', v_candidate_name),
    'pending',
    8, -- High priority for new applicants
    jsonb_build_object(
      'application_id', NEW.id,
      'candidate_email', NEW.email_from,
      'candidate_name', v_candidate_name,
      'missing_info', v_missing_info,
      'current_completeness', COALESCE(NEW.completeness_score, 0),
      'is_first_contact', true,
      'org_name', v_org_name
    )
  );
  
  RAISE LOG '[Welcome Trigger] Created welcome goal for application %: % missing fields', NEW.id, array_length(v_missing_info, 1);
  
  RETURN NEW;
END;
$$;

-- Drop old intake trigger if exists (replaced by welcome trigger)
DROP TRIGGER IF EXISTS trigger_ai_intake_on_new_application ON professional_applications;

-- Drop old welcome trigger if exists
DROP TRIGGER IF EXISTS trigger_welcome_on_new_application ON professional_applications;

-- Create new welcome trigger
CREATE TRIGGER trigger_welcome_on_new_application
  AFTER INSERT ON professional_applications
  FOR EACH ROW
  EXECUTE FUNCTION trigger_welcome_on_new_application();

-- Add comment for documentation
COMMENT ON FUNCTION trigger_welcome_on_new_application() IS 'Fase 3: Automatically creates a welcome + intake goal when a new application is received. Sends personalized welcome email with request for missing information.';