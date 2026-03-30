
-- FIX-NACHTUREN-1: Fix netto_uren GENERATED ALWAYS formule voor nachtdiensten
-- Drop en re-create met correcte overnight shift berekening

ALTER TABLE public.diensten DROP COLUMN IF EXISTS netto_uren;

ALTER TABLE public.diensten
  ADD COLUMN netto_uren NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE
      WHEN eind_tijd > start_tijd THEN
        EXTRACT(EPOCH FROM (eind_tijd - start_tijd)) / 3600.0 
        - COALESCE(pauze_minuten, 0) / 60.0
      WHEN eind_tijd < start_tijd THEN
        (EXTRACT(EPOCH FROM (eind_tijd - start_tijd)) + 86400) / 3600.0 
        - COALESCE(pauze_minuten, 0) / 60.0
      ELSE 0
    END
  ) STORED;
