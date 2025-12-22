-- Fix create_interview_task: change 'high' to 'HIGH'::priority to match enum values
CREATE OR REPLACE FUNCTION public.create_interview_task(
  p_application_id UUID,
  p_candidate_name TEXT,
  p_interview_date TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL
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
  -- Get org_id from application
  SELECT org_id INTO v_org_id
  FROM professional_applications
  WHERE id = p_application_id;
  
  -- Get first project for org (or NULL if none)
  SELECT id INTO v_project_id
  FROM projects
  WHERE org_id = v_org_id
  LIMIT 1;
  
  -- Create the interview task using interview_details column
  -- FIX: Changed 'high' to 'HIGH'::priority to match enum values
  INSERT INTO tasks (
    title,
    description,
    status,
    priority,
    category,
    due_at,
    start_at,
    org_id,
    project_id,
    interview_details
  ) VALUES (
    'Interview: ' || p_candidate_name,
    COALESCE(p_notes, 'Sollicitatiegesprek met ' || p_candidate_name),
    'TODO',
    'HIGH'::priority,
    'interview',
    p_interview_date,
    p_interview_date,
    v_org_id,
    v_project_id,
    jsonb_build_object(
      'application_id', p_application_id,
      'candidate_name', p_candidate_name,
      'interview_date', p_interview_date,
      'type', 'interview',
      'auto_created', true,
      'created_at', now()
    )
  )
  RETURNING id INTO v_task_id;
  
  -- Log success
  RAISE NOTICE 'Interview task created: % for application %', v_task_id, p_application_id;
  
  RETURN v_task_id;
END;
$$;