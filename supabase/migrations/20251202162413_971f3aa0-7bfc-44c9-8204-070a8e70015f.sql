-- Voeg ontbrekende unique index toe op professionals.email
CREATE UNIQUE INDEX IF NOT EXISTS professionals_email_unique_active 
ON professionals(email) 
WHERE deleted_at IS NULL AND email IS NOT NULL;