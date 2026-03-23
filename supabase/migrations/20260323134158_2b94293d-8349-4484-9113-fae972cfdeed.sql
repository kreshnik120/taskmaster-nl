UPDATE diensten
SET status = 'volledig_bezet', updated_at = NOW()
WHERE datum BETWEEN '2026-03-23' AND '2026-03-29'
  AND status = 'geannuleerd'
  AND bendy_id IS NOT NULL
  AND bendy_id IN (
    SELECT bendy_id FROM bendy_raw_cache
    WHERE entity_type = 'requisitions'
  );