-- Extend professionals werkvorm constraint to include ABCito constructie
ALTER TABLE professionals DROP CONSTRAINT IF EXISTS professionals_werkvorm_check;
ALTER TABLE professionals ADD CONSTRAINT professionals_werkvorm_check 
  CHECK (werkvorm = ANY (ARRAY['ZZP'::text, 'Uitzendkracht'::text, 'Beide'::text, 'ABCito constructie'::text]));