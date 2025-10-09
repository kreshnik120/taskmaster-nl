-- P5-2 FIX: Correct Alert Category Assignment (Fixed column reference)
-- Previous migration failed due to non-existent 'context' column

-- First, ensure data is valid jsonb (fix NULL cases)
UPDATE business_intelligence
SET data = '{}'::jsonb
WHERE data IS NULL;

-- Now assign categories based on title and data->>'context' patterns
UPDATE business_intelligence
SET data = jsonb_set(
  data,
  '{category}',
  to_jsonb(
    CASE 
      WHEN title ILIKE '%conflict%' OR title ILIKE '%conflicterende%' THEN 'knowledge_conflict'
      WHEN title ILIKE '%validation%' OR title ILIKE '%validatie%' THEN 'validation_issue'
      WHEN title ILIKE '%quality%' OR title ILIKE '%kwaliteit%' OR title ILIKE '%audit%' THEN 'data_quality'
      WHEN title ILIKE '%source%' OR title ILIKE '%bron%' THEN 'source_issue'
      WHEN title ILIKE '%tier%' THEN 'tier_classification'
      WHEN title ILIKE '%duplicate%' OR title ILIKE '%duplicaat%' THEN 'duplicate'
      WHEN title ILIKE '%performance%' OR title ILIKE '%slow%' THEN 'performance'
      WHEN data::text ILIKE '%conflict%' THEN 'knowledge_conflict'
      WHEN data::text ILIKE '%validation%' THEN 'validation_issue'
      ELSE 'general'
    END
  ),
  true  -- create_if_missing = true
)
WHERE intelligence_type = 'alert'
  AND severity IN ('critical', 'high')
  AND status = 'active'
  AND (data IS NULL OR NOT (data ? 'category'));

-- Add index for category filtering (performance optimization)
CREATE INDEX IF NOT EXISTS idx_bi_data_category 
  ON business_intelligence USING gin ((data->'category'));