-- ==============================================
-- MIGRATIE: Nieuwe Recruitment Flow Stages
-- gesprek_datum en gesprek_feedback velden toevoegen
-- ==============================================

-- Stap 1: Voeg nieuwe kolommen toe voor gesprek tracking
ALTER TABLE professional_applications 
ADD COLUMN IF NOT EXISTS gesprek_datum timestamp with time zone,
ADD COLUMN IF NOT EXISTS gesprek_feedback text;

-- Stap 2: Voeg constraint toe voor gesprek_feedback waarden
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_gesprek_feedback'
  ) THEN
    ALTER TABLE professional_applications 
    ADD CONSTRAINT valid_gesprek_feedback 
    CHECK (gesprek_feedback IS NULL OR gesprek_feedback IN ('pending', 'positive', 'negative', 'no_show'));
  END IF;
END $$;

-- Stap 3: Index voor snelle queries op gesprek_datum
CREATE INDEX IF NOT EXISTS idx_applications_gesprek_datum 
ON professional_applications(gesprek_datum) 
WHERE gesprek_datum IS NOT NULL;

-- Stap 4: Index voor gesprek_feedback filtering
CREATE INDEX IF NOT EXISTS idx_applications_gesprek_feedback
ON professional_applications(gesprek_feedback)
WHERE gesprek_feedback IS NOT NULL;

-- Stap 5: Commentaar voor documentatie
COMMENT ON COLUMN professional_applications.gesprek_datum IS 'Datum en tijd van het geplande fysieke sollicitatiegesprek';
COMMENT ON COLUMN professional_applications.gesprek_feedback IS 'Feedback na het gesprek: pending (nog niet gehad), positive (goedgekeurd), negative (afgewezen), no_show (niet verschenen)';