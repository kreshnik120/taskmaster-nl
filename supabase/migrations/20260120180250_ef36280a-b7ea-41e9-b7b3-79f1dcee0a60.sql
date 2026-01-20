-- Drop de oude constraint
ALTER TABLE professional_applications 
DROP CONSTRAINT IF EXISTS chk_vog_validation_status;

-- Maak nieuwe constraint met pending_review toegevoegd
ALTER TABLE professional_applications 
ADD CONSTRAINT chk_vog_validation_status 
CHECK (vog_validation_status = ANY (ARRAY[
  'missing',
  'received', 
  'validating',
  'authentic_ok',
  'authentic_fail',
  'expired',
  'manual_review',
  'pending_review'
]));