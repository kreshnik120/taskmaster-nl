-- Update create_interview_task function to accept enriched interview details
DROP FUNCTION IF EXISTS create_interview_task(uuid, text, timestamptz, uuid, text);

CREATE OR REPLACE FUNCTION create_interview_task(
  p_application_id UUID,
  p_candidate_name TEXT,
  p_interview_date TIMESTAMPTZ,
  p_org_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_candidate_email TEXT DEFAULT NULL,
  p_interview_type TEXT DEFAULT 'video',
  p_teams_link TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_duration_minutes INTEGER DEFAULT 30,
  p_interviewer_name TEXT DEFAULT NULL,
  p_interviewer_email TEXT DEFAULT NULL,
  p_organization_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task_id UUID;
  v_org_id UUID;
  v_project_id UUID;
BEGIN
  -- Use provided org_id or get from application
  IF p_org_id IS NOT NULL THEN
    v_org_id := p_org_id;
  ELSE
    SELECT org_id INTO v_org_id
    FROM professional_applications
    WHERE id = p_application_id;
  END IF;
  
  -- Get first project for org (or NULL if none)
  SELECT id INTO v_project_id
  FROM projects
  WHERE org_id = v_org_id
  LIMIT 1;
  
  -- Create the interview task with enriched interview_details
  INSERT INTO tasks (
    title,
    description,
    status,
    priority,
    category,
    start_at,
    due_at,
    org_id,
    project_id,
    application_id,
    interview_details
  ) VALUES (
    'Interview: ' || p_candidate_name,
    COALESCE(p_notes, 'Sollicitatiegesprek met ' || p_candidate_name),
    'TODO',
    'high',
    'interview',
    p_interview_date,
    p_interview_date + (COALESCE(p_duration_minutes, 30) * INTERVAL '1 minute'),
    v_org_id,
    v_project_id,
    p_application_id,
    jsonb_build_object(
      'application_id', p_application_id,
      'candidate_name', p_candidate_name,
      'candidate_email', p_candidate_email,
      'type', 'interview',
      'interview_type', p_interview_type,
      'teams_link', p_teams_link,
      'location', p_location,
      'duration_minutes', COALESCE(p_duration_minutes, 30),
      'interviewer_name', p_interviewer_name,
      'interviewer_email', p_interviewer_email,
      'organization_name', p_organization_name,
      'auto_created', true,
      'created_at', now()
    )
  )
  RETURNING id INTO v_task_id;
  
  RETURN v_task_id;
END;
$$;