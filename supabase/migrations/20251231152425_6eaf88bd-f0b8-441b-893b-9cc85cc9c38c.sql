-- Fix: Add 'received' to diploma_validation_status constraint
-- The code sets 'received' on upload but this value was missing from the constraint

ALTER TABLE professional_applications 
DROP CONSTRAINT IF EXISTS chk_diploma_validation_status;

ALTER TABLE professional_applications 
ADD CONSTRAINT chk_diploma_validation_status 
CHECK (diploma_validation_status IS NULL OR diploma_validation_status = ANY (ARRAY[
  'not_verified'::text, 
  'missing'::text, 
  'received'::text, 
  'verified_duo'::text, 
  'verified_manual'::text, 
  'signature_valid'::text, 
  'duo_invalid'::text, 
  'duo_not_digital'::text, 
  'duo_error'::text, 
  'manual_review'::text
]));