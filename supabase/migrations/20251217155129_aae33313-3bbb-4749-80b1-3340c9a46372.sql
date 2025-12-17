-- =============================================
-- FASE 1: Document Verificatie Statusmodel
-- =============================================

-- 1. Document status kolommen toevoegen aan professional_applications
ALTER TABLE professional_applications 
ADD COLUMN IF NOT EXISTS vog_validation_status TEXT DEFAULT 'missing',
ADD COLUMN IF NOT EXISTS vog_validation_source TEXT,
ADD COLUMN IF NOT EXISTS vog_issue_date DATE,
ADD COLUMN IF NOT EXISTS vog_valid_until DATE,
ADD COLUMN IF NOT EXISTS vog_verification_response JSONB,
ADD COLUMN IF NOT EXISTS diploma_validation_status TEXT DEFAULT 'missing',
ADD COLUMN IF NOT EXISTS diploma_validation_source TEXT,
ADD COLUMN IF NOT EXISTS diploma_verification_response JSONB,
ADD COLUMN IF NOT EXISTS documents_verified_by UUID,
ADD COLUMN IF NOT EXISTS documents_verified_at TIMESTAMPTZ;

-- 2. Check constraints voor status waarden
ALTER TABLE professional_applications 
DROP CONSTRAINT IF EXISTS chk_vog_validation_status;
ALTER TABLE professional_applications 
ADD CONSTRAINT chk_vog_validation_status 
CHECK (vog_validation_status IN ('missing', 'received', 'validating', 'authentic_ok', 'authentic_fail', 'expired', 'manual_review'));

ALTER TABLE professional_applications 
DROP CONSTRAINT IF EXISTS chk_vog_validation_source;
ALTER TABLE professional_applications 
ADD CONSTRAINT chk_vog_validation_source 
CHECK (vog_validation_source IS NULL OR vog_validation_source IN ('GAAV_API', 'manual', 'pending'));

ALTER TABLE professional_applications 
DROP CONSTRAINT IF EXISTS chk_diploma_validation_status;
ALTER TABLE professional_applications 
ADD CONSTRAINT chk_diploma_validation_status 
CHECK (diploma_validation_status IN ('missing', 'received', 'verified_emrex', 'verified_manual', 'manual_review'));

ALTER TABLE professional_applications 
DROP CONSTRAINT IF EXISTS chk_diploma_validation_source;
ALTER TABLE professional_applications 
ADD CONSTRAINT chk_diploma_validation_source 
CHECK (diploma_validation_source IS NULL OR diploma_validation_source IN ('EMREX', 'manual', 'pending'));

-- 3. Audit tabel voor stage transitions
CREATE TABLE IF NOT EXISTS application_stage_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES professional_applications(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  performed_by UUID,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index voor snelle lookups
CREATE INDEX IF NOT EXISTS idx_stage_audit_application ON application_stage_audit(application_id);
CREATE INDEX IF NOT EXISTS idx_stage_audit_performed_at ON application_stage_audit(performed_at DESC);

-- RLS voor audit tabel
ALTER TABLE application_stage_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all stage audits" ON application_stage_audit
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert stage audits" ON application_stage_audit
FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Centrale stage transition functie
CREATE OR REPLACE FUNCTION transition_application_stage(
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
    -- VOG moet minstens ontvangen zijn
    IF v_vog_status = 'missing' THEN
      v_blocking_reason := 'VOG document is required for screening stage';
    END IF;
  END IF;

  IF p_to_stage = 'goedgekeurd' THEN
    -- VOG moet geverifieerd zijn
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

  -- 5. Update stage
  UPDATE professional_applications
  SET pipeline_stage = p_to_stage,
      status = CASE 
        WHEN p_to_stage = 'afgewezen' THEN 'rejected'
        WHEN p_to_stage = 'geplaatst' THEN 'placed'
        ELSE 'active'
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

-- 5. Functie voor handmatige document verificatie
CREATE OR REPLACE FUNCTION verify_document_manual(
  p_application_id UUID,
  p_document_type TEXT, -- 'vog' of 'diploma'
  p_verified BOOLEAN,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_document_type = 'vog' THEN
    UPDATE professional_applications
    SET 
      vog_validation_status = CASE WHEN p_verified THEN 'authentic_ok' ELSE 'authentic_fail' END,
      vog_validation_source = 'manual',
      vog_verification_response = jsonb_build_object(
        'manual_verification', true,
        'verified', p_verified,
        'notes', p_notes,
        'verified_at', NOW()
      ),
      documents_verified_by = auth.uid(),
      documents_verified_at = NOW(),
      updated_at = NOW()
    WHERE id = p_application_id;
  ELSIF p_document_type = 'diploma' THEN
    UPDATE professional_applications
    SET 
      diploma_validation_status = CASE WHEN p_verified THEN 'verified_manual' ELSE 'manual_review' END,
      diploma_validation_source = 'manual',
      diploma_verification_response = jsonb_build_object(
        'manual_verification', true,
        'verified', p_verified,
        'notes', p_notes,
        'verified_at', NOW()
      ),
      documents_verified_by = auth.uid(),
      documents_verified_at = NOW(),
      updated_at = NOW()
    WHERE id = p_application_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid document type');
  END IF;

  RETURN jsonb_build_object('success', true, 'document_type', p_document_type, 'verified', p_verified);
END;
$$;