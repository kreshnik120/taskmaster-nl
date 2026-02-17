-- CORRECTIE: Herstel professionals status op basis van Bendy raw_cache
-- De vorige migratie zette foutief alle inactief → actief
-- Nu herstellen we de juiste status vanuit de originele Bendy data

UPDATE public.professionals p
SET
  status = CASE
    WHEN LOWER(COALESCE(brc.raw_data -> 'attributes' ->> 'state', '')) IN ('inactief', 'geblokkeerd', 'verwijderd', 'blocked', 'deleted')
      THEN 'inactief'
    ELSE 'actief'
  END,
  updated_at = now()
FROM public.bendy_raw_cache brc
WHERE brc.bendy_id = p.bendy_id
  AND brc.entity_type = 'users'
  AND p.deleted_at IS NULL
  AND p.bendy_id IS NOT NULL;