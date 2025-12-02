
-- Nu duplicate application soft-deleted is: voeg unique index toe
CREATE UNIQUE INDEX IF NOT EXISTS applications_email_unique_active 
ON professional_applications(email_from) 
WHERE deleted_at IS NULL AND email_from IS NOT NULL;
