
-- Update de professionals_status_check constraint om 'beschikbaar' toe te voegen
ALTER TABLE professionals DROP CONSTRAINT IF EXISTS professionals_status_check;

ALTER TABLE professionals ADD CONSTRAINT professionals_status_check 
CHECK (status = ANY (ARRAY['actief'::text, 'inactief'::text, 'pauze'::text, 'beschikbaar'::text]));
