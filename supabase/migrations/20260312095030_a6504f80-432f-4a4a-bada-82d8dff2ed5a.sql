
CREATE OR REPLACE FUNCTION public.cleanup_diensten_duplicates(batch_size INT DEFAULT 5000)
RETURNS JSON AS $$
DECLARE
  deleted_count INT := 0;
  batch_deleted INT;
  total_dupes INT;
BEGIN
  -- Tel totaal duplicaten
  SELECT COUNT(*) INTO total_dupes FROM (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY org_id, bendy_id ORDER BY created_at ASC) as rn
      FROM public.diensten WHERE bendy_id IS NOT NULL
    ) sub WHERE rn > 1
  ) dupes;

  -- Verwijder in batches
  LOOP
    WITH dupes AS (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY org_id, bendy_id ORDER BY created_at ASC) as rn
        FROM public.diensten WHERE bendy_id IS NOT NULL
      ) sub WHERE rn > 1
      LIMIT batch_size
    )
    DELETE FROM public.diensten WHERE id IN (SELECT id FROM dupes);

    GET DIAGNOSTICS batch_deleted = ROW_COUNT;
    deleted_count := deleted_count + batch_deleted;
    EXIT WHEN batch_deleted = 0;
  END LOOP;

  -- Maak UNIQUE index aan als die nog niet bestaat
  CREATE UNIQUE INDEX IF NOT EXISTS idx_diensten_org_bendy_id_unique
  ON public.diensten (org_id, bendy_id) WHERE bendy_id IS NOT NULL;

  RETURN json_build_object(
    'total_duplicates_found', total_dupes,
    'total_deleted', deleted_count,
    'unique_index_created', true
  );
END;
$$ LANGUAGE plpgsql;
