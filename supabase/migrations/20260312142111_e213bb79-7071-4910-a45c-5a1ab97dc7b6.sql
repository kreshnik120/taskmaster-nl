
-- Helper index for fast duplicate lookup
CREATE INDEX IF NOT EXISTS idx_diensten_org_bendy_created_id 
ON public.diensten (org_id, bendy_id, created_at, id) 
WHERE bendy_id IS NOT NULL;

-- Replace cleanup function with optimized delete-first approach
CREATE OR REPLACE FUNCTION public.cleanup_diensten_duplicates(batch_size INT DEFAULT 200)
RETURNS JSON AS $$
DECLARE
  deleted_count INT := 0;
  has_more BOOLEAN := false;
  index_created BOOLEAN := false;
  remaining INT;
BEGIN
  -- Delete duplicates directly (keep earliest created_at, tie-break on id)
  DELETE FROM public.diensten
  WHERE id IN (
    SELECT d1.id
    FROM public.diensten d1
    WHERE d1.bendy_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.diensten d2
        WHERE d2.org_id = d1.org_id
          AND d2.bendy_id = d1.bendy_id
          AND (d2.created_at < d1.created_at OR (d2.created_at = d1.created_at AND d2.id < d1.id))
      )
    LIMIT batch_size
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    -- We deleted some, assume more exist
    has_more := true;
  ELSE
    -- Nothing deleted, do a lightweight check
    SELECT EXISTS (
      SELECT 1 FROM public.diensten d1
      WHERE d1.bendy_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.diensten d2
          WHERE d2.org_id = d1.org_id
            AND d2.bendy_id = d1.bendy_id
            AND (d2.created_at < d1.created_at OR (d2.created_at = d1.created_at AND d2.id < d1.id))
        )
      LIMIT 1
    ) INTO has_more;

    IF NOT has_more THEN
      -- All clean, create unique index
      CREATE UNIQUE INDEX IF NOT EXISTS idx_diensten_org_bendy_id_unique
      ON public.diensten (org_id, bendy_id) WHERE bendy_id IS NOT NULL;
      index_created := true;
    END IF;
  END IF;

  RETURN json_build_object(
    'deleted_this_batch', deleted_count,
    'has_more', has_more,
    'unique_index_created', index_created,
    'message', CASE 
      WHEN index_created THEN 'Cleanup voltooid, UNIQUE index aangemaakt'
      WHEN deleted_count > 0 THEN format('%s duplicaten verwijderd in deze batch', deleted_count)
      ELSE 'Nog duplicaten gevonden, doorgaan...'
    END
  );
END;
$$ LANGUAGE plpgsql;
