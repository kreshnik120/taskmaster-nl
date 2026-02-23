-- Verwijder bestaande check constraint als die bestaat en voeg HBO/WO toe
DO $$
BEGIN
  -- Drop constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'professionals_functie_niveau_check' 
    AND table_name = 'professionals'
  ) THEN
    ALTER TABLE professionals DROP CONSTRAINT professionals_functie_niveau_check;
  END IF;
END $$;

-- Voeg nieuwe constraint toe met HBO en WO
ALTER TABLE professionals ADD CONSTRAINT professionals_functie_niveau_check 
CHECK (functie_niveau IN ('Helpende', 'Helpende 2', 'VIG', 'Begeleider', 'Persoonlijk begeleider', 'Verpleegkundige MBO', 'Verpleegkundige (MBO)', 'VP3', 'VP4', 'GGZ-agoog', 'HBO-V', 'HBO', 'WO') OR functie_niveau IS NULL);