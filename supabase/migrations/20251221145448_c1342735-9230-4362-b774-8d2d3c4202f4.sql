-- Fix transition_application_stage function to use correct status values
-- that are allowed by the professional_applications_status_check constraint

CREATE OR REPLACE FUNCTION public.transition_application_stage(
  p_application_id UUID,
  p_to_stage TEXT,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stage TEXT;
  v_vog_status TEXT;
  v_diploma_status TEXT;
  v_allowed BOOLEAN := false;
  v_blocking_reason TEXT;
BEGIN
  -- 1. Lock record voor idempotentie
  SELECT pipeline_stage, vog_validation_status, diploma_validation_status 
  INTO v_current_stage, v_vog_status, v_diploma_status
  FROM professional_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found');
  END IF;

  -- 2. Idempotentie check
  IF v_current_stage = p_to_stage THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already in stage', 'idempotent', true);
  END IF;

  -- 3. Valideer toegestane transities
  v_allowed := CASE
    WHEN v_current_stage = 'nieuw' AND p_to_stage IN ('interview', 'afgewezen') THEN true
    WHEN v_current_stage = 'interview' AND p_to_stage IN ('screening', 'afgewezen') THEN true
    WHEN v_current_stage = 'screening' AND p_to_stage IN ('goedgekeurd', 'afgewezen') THEN true
    WHEN v_current_stage = 'goedgekeurd' AND p_to_stage IN ('geplaatst', 'afgewezen') THEN true
    ELSE false
  END;

  IF NOT v_allowed THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', format('Transition %s → %s not allowed', v_current_stage, p_to_stage)
    );
  END IF;

  -- 4. Document verificatie gates
  IF p_to_stage = 'screening' THEN
    IF v_vog_status = 'missing' THEN
      v_blocking_reason := 'VOG document is required for screening stage';
    END IF;
  END IF;

  IF p_to_stage = 'goedgekeurd' THEN
    IF v_vog_status NOT IN ('authentic_ok', 'verified_manual') THEN
      v_blocking_reason := 'VOG must be verified (GAAV or manual) before approval';
    END IF;
  END IF;

  IF v_blocking_reason IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', v_blocking_reason,
      'blocking_document', true
    );
  END IF;

  -- 5. Update stage met CORRECTE status waarden (fix voor constraint)
  UPDATE professional_applications
  SET pipeline_stage = p_to_stage,
      status = CASE 
        WHEN p_to_stage = 'afgewezen' THEN 'afgewezen'
        WHEN p_to_stage = 'geplaatst' THEN 'geaccepteerd'
        WHEN p_to_stage = 'goedgekeurd' THEN 'geaccepteerd'
        WHEN p_to_stage IN ('interview', 'screening') THEN 'in_verwerking'
        ELSE 'nieuw'
      END,
      updated_at = NOW()
  WHERE id = p_application_id;

  -- 6. Audit log
  INSERT INTO application_stage_audit (
    application_id, from_stage, to_stage, reason, metadata, performed_by
  ) VALUES (
    p_application_id, v_current_stage, p_to_stage, p_reason, p_metadata, auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true, 
    'from', v_current_stage, 
    'to', p_to_stage,
    'vog_status', v_vog_status,
    'diploma_status', v_diploma_status
  );
END;
$$;