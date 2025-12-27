-- Add DUO diploma verification columns to professional_applications
ALTER TABLE professional_applications
ADD COLUMN IF NOT EXISTS duo_verification_status TEXT DEFAULT 'not_verified',
ADD COLUMN IF NOT EXISTS duo_verification_result JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS duo_verified_at TIMESTAMPTZ;

-- Add diploma file path if not exists
ALTER TABLE professional_applications
ADD COLUMN IF NOT EXISTS diploma_file_path TEXT;

-- Add comment for documentation
COMMENT ON COLUMN professional_applications.duo_verification_status IS 'DUO Online Diplomacontrole verification status: not_verified, pending, verified, invalid, not_digital, error, manual_review';
COMMENT ON COLUMN professional_applications.duo_verification_result IS 'Full verification result from DUO portal including any error details';
COMMENT ON COLUMN professional_applications.duo_verified_at IS 'Timestamp when DUO verification was completed';
COMMENT ON COLUMN professional_applications.diploma_file_path IS 'Storage path to diploma PDF file';