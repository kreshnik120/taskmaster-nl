-- =====================================================
-- STAP 1: Database Trigger voor Automatische Goal Creatie
-- =====================================================
-- Deze trigger creëert automatisch een agent_goal wanneer een 
-- sollicitatie binnenkomt met completeness_score < 80%

-- Trigger functie die agent_goal aanmaakt bij incomplete applicaties
CREATE OR REPLACE FUNCTION public.trigger_application_intake_goal()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = 'public'
AS $$
DECLARE
  existing_goal_count INTEGER;
BEGIN
  -- Check of completeness < 80% en email adres beschikbaar
  IF NEW.completeness_score < 80 AND NEW.email_from IS NOT NULL THEN
    
    -- Check of er al een actief goal bestaat voor deze applicatie
    SELECT COUNT(*) INTO existing_goal_count
    FROM agent_goals 
    WHERE (input_data->>'application_id')::uuid = NEW.id
      AND goal_type = 'application_intake_completion'
      AND status IN ('pending', 'planning', 'executing');
    
    -- Alleen een nieuw goal aanmaken als er geen actief goal is
    IF existing_goal_count = 0 THEN
      INSERT INTO agent_goals (
        org_id,
        goal_type,
        goal_description,
        priority,
        input_data,
        status
      ) VALUES (
        NEW.org_id,
        'application_intake_completion',
        'Verzamel ontbrekende informatie voor sollicitatie ' || COALESCE(
          NEW.extracted_data->>'naam', 
          split_part(NEW.email_from, '@', 1)
        ),
        100 - COALESCE(NEW.completeness_score, 0), -- Hogere prioriteit = lagere score
        jsonb_build_object(
          'application_id', NEW.id,
          'candidate_email', NEW.email_from,
          'candidate_name', COALESCE(NEW.extracted_data->>'naam', split_part(NEW.email_from, '@', 1)),
          'missing_info', COALESCE(NEW.missing_info, '[]'::jsonb),
          'current_completeness', COALESCE(NEW.completeness_score, 0),
          'follow_up_count', 0
        ),
        'pending'
      );
      
      RAISE LOG 'Created application_intake_completion goal for application %', NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_application_intake_incomplete ON professional_applications;

-- Trigger op INSERT voor nieuwe sollicitaties
CREATE TRIGGER on_application_intake_incomplete
  AFTER INSERT ON professional_applications
  FOR EACH ROW
  EXECUTE FUNCTION trigger_application_intake_goal();

-- Comment voor documentatie
COMMENT ON FUNCTION trigger_application_intake_goal() IS 
'Creëert automatisch een agent_goal voor application_intake_completion wanneer een sollicitatie binnenkomt met completeness_score < 80%. Dit activeert de AI Agent om follow-up vragen te sturen via email.';