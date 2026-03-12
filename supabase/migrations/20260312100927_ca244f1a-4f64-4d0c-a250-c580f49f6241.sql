CREATE OR REPLACE FUNCTION public.cleanup_diensten_duplicates(batch_size INT DEFAULT 500)
RETURNS JSON AS $$
DECLARE
  deleted_count INT := 0;
  remaining_count INT;
BEGIN
  -- Count remaining duplicates using lightweight EXISTS
  SELECT count(*) INTO remaining_count
  FROM public.diensten d1
  WHERE d1.bendy_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.diensten d2
      WHERE d2.org_id = d1.org_id
        AND d2.bendy_id = d1.bendy_id
        AND d2.created_at < d1.created_at
    );

  IF remaining_count > 0 THEN
    DELETE FROM public.diensten
    WHERE ctid IN (
      SELECT d1.ctid
      FROM public.diensten d1
      WHERE d1.bendy_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.diensten d2
          WHERE d2.org_id = d1.org_id
            AND d2.bendy_id = d1.bendy_id
            AND d2.created_at < d1.created_at
        )
      LIMIT batch_size
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
  END IF;

  -- Recalculate after deletion
  SELECT count(*) INTO remaining_count
  FROM public.diensten d1
  WHERE d1.bendy_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.diensten d2
      WHERE d2.org_id = d1.org_id
        AND d2.bendy_id = d1.bendy_id
        AND d2.created_at < d1.created_at
    );

  IF remaining_count = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_diensten_org_bendy_id_unique
    ON public.diensten (org_id, bendy_id) WHERE bendy_id IS NOT NULL;
  END IF;

  RETURN json_build_object(
    'duplicates_remaining', remaining_count,
    'deleted_this_batch', deleted_count,
    'unique_index_created', remaining_count = 0
  );
END;
$$ LANGUAGE plpgsql;