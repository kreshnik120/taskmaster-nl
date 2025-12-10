-- Create trigger function for automatic email follow-up
CREATE OR REPLACE FUNCTION trigger_intake_followup_goal()
RETURNS TRIGGER AS $$
DECLARE
  existing_goal_count INTEGER;
BEGIN
  -- Only trigger if completeness_score < 80%, email is available, and not deleted
  IF NEW.completeness_score IS NOT NULL 
     AND NEW.completeness_score < 80 
     AND NEW.email_from IS NOT NULL 
     AND NEW.deleted_at IS NULL THEN
    
    -- Check if there's already an active goal for this application
    SELECT COUNT(*) INTO existing_goal_count
    FROM agent_goals 
    WHERE input_data->>'application_id' = NEW.id::text
      AND status IN ('pending', 'planning', 'executing', 'in_progress');
    
    IF existing_goal_count = 0 THEN
      -- Create new goal
      INSERT INTO agent_goals (
        org_id,
        goal_type,
        goal_description,
        status,
        priority,
        input_data
      ) VALUES (
        COALESCE(NEW.org_id, '650e8400-e29b-41d4-a716-446655440001'::uuid),
        'application_intake_completion',
        'Automatisch vervolgvragen voor incomplete sollicitatie',
        'pending',
        5,
        jsonb_build_object(
          'application_id', NEW.id,
          'candidate_email', NEW.email_from,
          'candidate_name', COALESCE(NEW.extracted_data->>'naam', 'Kandidaat'),
          'missing_info', COALESCE(NEW.missing_info, '[]'::jsonb),
          'current_completeness', NEW.completeness_score,
          'triggered_by', 'database_trigger',
          'triggered_at', NOW()
        )
      );
      
      RAISE LOG 'AI goal created for application % with completeness %', NEW.id, NEW.completeness_score;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS auto_intake_followup ON professional_applications;

-- Create trigger for INSERT and UPDATE on completeness_score
CREATE TRIGGER auto_intake_followup
AFTER INSERT OR UPDATE OF completeness_score ON professional_applications
FOR EACH ROW
EXECUTE FUNCTION trigger_intake_followup_goal();