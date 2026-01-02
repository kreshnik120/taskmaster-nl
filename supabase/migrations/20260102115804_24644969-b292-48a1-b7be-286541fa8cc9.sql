-- Add tracking columns for diploma re-verification
ALTER TABLE professional_applications 
ADD COLUMN IF NOT EXISTS reverification_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reverification_at TIMESTAMPTZ;

-- Add index for efficient querying of re-verifiable candidates
CREATE INDEX IF NOT EXISTS idx_applications_reverification_candidates 
ON professional_applications (diploma_validation_status, reverification_attempts, last_reverification_at)
WHERE diploma_validation_status IN ('signature_valid', 'duo_error', 'duo_not_digital', 'manual_review')
  AND deleted_at IS NULL;

-- Comment for documentation
COMMENT ON COLUMN professional_applications.reverification_attempts IS 'Number of automatic re-verification attempts for diploma (max 3)';
COMMENT ON COLUMN professional_applications.last_reverification_at IS 'Timestamp of last re-verification attempt (cooldown: 7 days)';