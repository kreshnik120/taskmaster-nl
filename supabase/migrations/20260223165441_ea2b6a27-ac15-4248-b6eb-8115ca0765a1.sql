ALTER TABLE professionals ADD COLUMN IF NOT EXISTS bendy_groepen text[] DEFAULT '{}';
COMMENT ON COLUMN professionals.bendy_groepen IS 'Bendy flexpool groepnamen, automatisch gesyncet';