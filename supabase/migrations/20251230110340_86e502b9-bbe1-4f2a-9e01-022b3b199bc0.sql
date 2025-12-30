-- First drop the constraint that's blocking our update
ALTER TABLE professional_applications DROP CONSTRAINT IF EXISTS chk_diploma_validation_status;

-- Now we can safely add the new constraint with all needed values
ALTER TABLE professional_applications ADD CONSTRAINT chk_diploma_validation_status 
CHECK (diploma_validation_status IS NULL OR diploma_validation_status IN (
  'not_verified',
  'missing',
  'verified_duo',
  'verified_manual',
  'signature_valid',
  'duo_invalid',
  'duo_not_digital',
  'duo_error',
  'manual_review'
));