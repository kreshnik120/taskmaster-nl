
-- P0-A: Nachtdienst + Slaapdienst + Fundament

-- Nieuwe kolommen
ALTER TABLE public.diensten
  ADD COLUMN IF NOT EXISTS is_slaapdienst BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS slaap_start_tijd TIME,
  ADD COLUMN IF NOT EXISTS slaap_eind_tijd TIME,
  ADD COLUMN IF NOT EXISTS flexwerker_opmerking TEXT,
  ADD COLUMN IF NOT EXISTS vereiste_certificeringen TEXT[] DEFAULT '{}';

-- gevraagd_functie_niveau van TEXT naar TEXT[]
ALTER TABLE public.diensten
  ALTER COLUMN gevraagd_functie_niveau TYPE TEXT[] USING
    CASE
      WHEN gevraagd_functie_niveau IS NULL THEN '{}'::TEXT[]
      ELSE ARRAY[gevraagd_functie_niveau]
    END;

ALTER TABLE public.diensten
  ALTER COLUMN gevraagd_functie_niveau SET DEFAULT '{}';

-- netto_uren herberekenen voor over-middernacht
ALTER TABLE public.diensten
  DROP COLUMN IF EXISTS netto_uren;

ALTER TABLE public.diensten
  ADD COLUMN netto_uren NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE
      WHEN eind_tijd > start_tijd THEN
        EXTRACT(EPOCH FROM (eind_tijd - start_tijd)) / 3600.0 - COALESCE(pauze_minuten, 0) / 60.0
      WHEN eind_tijd < start_tijd THEN
        EXTRACT(EPOCH FROM (eind_tijd + INTERVAL '24 hours' - start_tijd)) / 3600.0 - COALESCE(pauze_minuten, 0) / 60.0
      ELSE 0
    END
  ) STORED;
