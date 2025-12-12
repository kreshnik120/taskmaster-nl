-- Fase 1: Database trigger voor automatische interview scheduling
-- Wanneer completeness_score >= 80% EN pipeline_stage = 'screening', maak automatisch schedule_interview goal

CREATE OR REPLACE FUNCTION public.trigger_auto_schedule_interview()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing_goal_count INTEGER;
BEGIN
  -- Check of we naar screening gaan met voldoende completeness
  IF NEW.pipeline_stage = 'screening' 
     AND NEW.completeness_score >= 80 
     AND (OLD.pipeline_stage IS DISTINCT FROM 'screening' OR OLD.completeness_score < 80) THEN
    
    -- Check of er al een schedule_interview goal bestaat voor deze applicatie
    SELECT COUNT(*) INTO existing_goal_count
    FROM agent_goals
    WHERE input_data->>'application_id' = NEW.id::text
      AND goal_type = 'schedule_interview'
      AND status IN ('pending', 'in_progress', 'completed');
    
    -- Alleen aanmaken als er nog geen goal bestaat
    IF existing_goal_count = 0 THEN
      INSERT INTO agent_goals (
        org_id,
        goal_type,
        goal_description,
        status,
        priority,
        input_data
      ) VALUES (
        NEW.org_id,
        'schedule_interview',
        'Plan automatisch interview voor kandidaat met 80%+ completeness',
        'pending',
        2,
        jsonb_build_object(
          'application_id', NEW.id,
          'candidate_name', COALESCE(NEW.extracted_data->>'naam', 'Onbekend'),
          'candidate_email', NEW.email_from,
          'trigger_reason', 'auto_completeness_threshold'
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists en maak nieuwe
DROP TRIGGER IF EXISTS trigger_auto_interview_on_screening ON professional_applications;

CREATE TRIGGER trigger_auto_interview_on_screening
  AFTER UPDATE ON professional_applications
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_schedule_interview();

-- Fase 2: Functie voor automatische taak creatie bij interview bevestiging
-- Deze wordt aangeroepen door de schedule-interview edge function

CREATE OR REPLACE FUNCTION public.create_interview_task(
  p_application_id UUID,
  p_candidate_name TEXT,
  p_interview_date TIMESTAMPTZ,
  p_org_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task_id UUID;
  v_project_id UUID;
BEGIN
  -- Haal default project op (eerste actieve project van org)
  SELECT id INTO v_project_id
  FROM projects
  WHERE org_id = p_org_id
  LIMIT 1;
  
  -- Maak interview taak aan
  INSERT INTO tasks (
    org_id,
    project_id,
    title,
    description,
    status,
    priority,
    category,
    due_at,
    metadata
  ) VALUES (
    p_org_id,
    v_project_id,
    'Interview: ' || p_candidate_name,
    COALESCE(p_notes, 'Gepland interview met kandidaat ' || p_candidate_name || '. Voer het gesprek en geef feedback.'),
    'open',
    'high',
    'Interview',
    p_interview_date,
    jsonb_build_object(
      'application_id', p_application_id,
      'type', 'interview',
      'auto_created', true
    )
  )
  RETURNING id INTO v_task_id;
  
  RETURN v_task_id;
END;
$$;