-- Fix functie_niveau voor bestaande professionals op basis van Bendy function_type uit raw_cache
-- Na de code-deploy + volgende sync worden alle waarden dynamisch gedecodeerd via selection_lists
UPDATE professionals p
SET functie_niveau = CASE
  WHEN LOWER(rc.function_type) ~ 'persoonlijk\s*begeleider' THEN 'Persoonlijk begeleider'
  WHEN LOWER(rc.function_type) ~ 'begeleider|bgl' THEN 'Begeleider'
  WHEN LOWER(rc.function_type) ~ 'verpleegkundige|vp|hbo.?v' THEN 'Verpleegkundige (MBO)'
  WHEN LOWER(rc.function_type) ~ 'vig|verzorgend' THEN 'VIG'
  WHEN LOWER(rc.function_type) ~ 'ggz' THEN 'GGZ-agoog'
  ELSE 'Helpende'
END,
updated_at = NOW()
FROM (
  SELECT
    bendy_id,
    raw_data->'attributes'->>'function_type' as function_type
  FROM bendy_raw_cache
  WHERE entity_type = 'users'
    AND raw_data->'attributes'->>'function_type' IS NOT NULL
    AND raw_data->'attributes'->>'function_type' != ''
) rc
WHERE p.bendy_id = rc.bendy_id
  AND p.deleted_at IS NULL
  AND rc.function_type IS NOT NULL;