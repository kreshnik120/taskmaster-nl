-- P5-2-FIX: Correct Alert Category Assignment (Use intelligence_type field)
-- Previous migration failed by using data::text ILIKE instead of intelligence_type

-- Update all critical/high alerts with proper categories based on intelligence_type
UPDATE business_intelligence
SET data = jsonb_set(
  COALESCE(data, '{}'::jsonb),
  '{category}',
  to_jsonb(
    CASE intelligence_type
      WHEN 'knowledge_conflict' THEN 'knowledge_conflict'
      WHEN 'validation_issue' THEN 'validation_issue'
      WHEN 'data_quality' THEN 'data_quality'
      WHEN 'broken_sources' THEN 'source_issue'
      WHEN 'knowledge_gap' THEN 'knowledge_gap'
      WHEN 'tier_classification' THEN 'tier_classification'
      WHEN 'duplicate' THEN 'duplicate'
      WHEN 'performance' THEN 'performance'
      WHEN 'alert' THEN 'general'
      ELSE intelligence_type
    END
  ),
  true
)
WHERE severity IN ('critical', 'high')
  AND status = 'active'
  AND (data IS NULL OR NOT (data ? 'category'));

-- Add index for category filtering if not exists
CREATE INDEX IF NOT EXISTS idx_bi_data_category 
  ON business_intelligence USING gin ((data->'category'));

-- Verification query (results logged for monitoring)
DO $$
DECLARE
  categorized_count INTEGER;
  not_categorized_count INTEGER;
BEGIN
  SELECT 
    COUNT(*) FILTER (WHERE data ? 'category'),
    COUNT(*) FILTER (WHERE NOT (data ? 'category'))
  INTO categorized_count, not_categorized_count
  FROM business_intelligence
  WHERE severity = 'critical' AND status = 'active';
  
  RAISE NOTICE 'Alert Categorization Results: % categorized, % not categorized', 
    categorized_count, not_categorized_count;
END $$;