-- Voeg duo_not_digital en duo_error toe aan de diploma_validation_status constraint
ALTER TABLE professional_applications 
DROP CONSTRAINT IF EXISTS chk_diploma_validation_status;

ALTER TABLE professional_applications 
ADD CONSTRAINT chk_diploma_validation_status 
CHECK (diploma_validation_status = ANY (ARRAY[
  'missing'::text, 
  'received'::text, 
  'pending'::text,
  'verified_emrex'::text, 
  'verified_manual'::text, 
  'verified_duo'::text,
  'duo_invalid'::text,
  'duo_not_digital'::text,
  'duo_error'::text,
  'manual_review'::text
]));