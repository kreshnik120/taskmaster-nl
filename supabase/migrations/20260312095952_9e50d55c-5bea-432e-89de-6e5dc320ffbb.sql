CREATE OR REPLACE FUNCTION public.cleanup_diensten_duplicates(batch_size INT DEFAULT 2000)
RETURNS JSON AS $$
DECLARE
  deleted_count INT := 0;
  total_dupes INT;
BEGIN
  SELECT COUNT(*) INTO total_dupes FROM (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY org_id, bendy_id ORDER BY created_at ASC) as rn
      FROM public.diensten WHERE bendy_id IS NOT NULL
    ) sub WHERE rn > 1
  ) dupes;

  IF total_dupes > 0 THEN
    WITH dupes AS (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY org_id, bendy_id ORDER BY created_at ASC) as rn
        FROM public.diensten WHERE bendy_id IS NOT NULL
      ) sub WHERE rn > 1
      LIMIT batch_size
    )
    DELETE FROM public.diensten WHERE id IN (SELECT id FROM dupes);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
  END IF;

  IF (total_dupes - deleted_count) <= 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_diensten_org_bendy_id_unique
    ON public.diensten (org_id, bendy_id) WHERE bendy_id IS NOT NULL;
  END IF;

  RETURN json_build_object(
    'duplicates_remaining', GREATEST(total_dupes - deleted_count, 0),
    'deleted_this_batch', deleted_count,
    'unique_index_created', (total_dupes - deleted_count) <= 0
  );
END;
$$ LANGUAGE plpgsql;