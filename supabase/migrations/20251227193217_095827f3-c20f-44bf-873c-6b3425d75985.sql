-- Update transition_application_stage function to block interview stage without verified diploma

CREATE OR REPLACE FUNCTION public.transition_application_stage(
  p_application_id uuid,
  p_to_stage text,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_stage text;
  v_diploma_status text;
  v_blocking_reason text := NULL;
  v_result jsonb;
BEGIN
  -- Get current application data
  SELECT 
    pipeline_stage,
    diploma_validation_status
  INTO 
    v_current_stage,
    v_diploma_status
  FROM professional_applications
  WHERE id = p_application_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'blocked', true,
      'reason', 'Sollicitatie niet gevonden'
    );
  END IF;

  -- Check if already at target stage
  IF v_current_stage = p_to_stage THEN
    RETURN jsonb_build_object(
      'success', true,
      'blocked', false,
      'message', 'Al in deze fase'
    );
  END IF;

  -- DIPLOMA BLOCKING: Check for interview stage
  IF p_to_stage = 'interview' THEN
    IF v_diploma_status IS NULL OR v_diploma_status NOT IN ('verified_duo', 'verified_manual', 'verified_emrex') THEN
      v_blocking_reason := 'Diploma moet geverifieerd zijn (DUO, EMREX of handmatig) voordat een interview gepland kan worden';
    END IF;
  END IF;

  -- DIPLOMA BLOCKING: Check for goedgekeurd stage
  IF p_to_stage = 'goedgekeurd' THEN
    IF v_diploma_status IS NULL OR v_diploma_status NOT IN ('verified_duo', 'verified_manual', 'verified_emrex') THEN
      v_blocking_reason := 'Diploma moet geverifieerd zijn voordat kandidaat goedgekeurd kan worden';
    END IF;
  END IF;

  -- If blocked, return error
  IF v_blocking_reason IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'blocked', true,
      'reason', v_blocking_reason,
      'current_diploma_status', v_diploma_status
    );
  END IF;

  -- Perform the stage transition
  UPDATE professional_applications
  SET 
    pipeline_stage = p_to_stage,
    updated_at = NOW()
  WHERE id = p_application_id;

  -- Log the transition
  INSERT INTO application_stage_audit (
    application_id,
    from_stage,
    to_stage,
    performed_by,
    performed_at
  ) VALUES (
    p_application_id,
    v_current_stage,
    p_to_stage,
    p_user_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'blocked', false,
    'from_stage', v_current_stage,
    'to_stage', p_to_stage
  );
END;
$function$;