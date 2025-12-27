-- Drop de oude constraint
ALTER TABLE professional_applications 
DROP CONSTRAINT IF EXISTS chk_diploma_validation_status;

-- Voeg nieuwe constraint toe met alle geldige statussen inclusief DUO
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
  'manual_review'::text
]));