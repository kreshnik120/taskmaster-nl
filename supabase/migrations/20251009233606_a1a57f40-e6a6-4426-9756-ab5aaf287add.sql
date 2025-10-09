-- P4-2: Fix Alert Metadata for Knowledge Conflicts
-- Extract category from title/context and update business_intelligence alerts

UPDATE business_intelligence
SET data = jsonb_set(
  data,
  '{category}',
  to_jsonb(
    CASE 
      WHEN title ILIKE '%conflict%' OR title ILIKE '%conflicterende%' THEN 'knowledge_conflict'
      WHEN title ILIKE '%validation%' OR title ILIKE '%validatie%' THEN 'validation_issue'
      WHEN title ILIKE '%data quality%' OR title ILIKE '%datakwaliteit%' THEN 'data_quality'
      WHEN title ILIKE '%source%' OR title ILIKE '%bron%' THEN 'source_issue'
      WHEN title ILIKE '%tier%' THEN 'tier_classification'
      WHEN title ILIKE '%duplicate%' OR title ILIKE '%duplicaat%' THEN 'duplicate'
      ELSE 'general'
    END
  )
)
WHERE intelligence_type = 'alert'
  AND severity IN ('critical', 'high')
  AND (data->>'category' IS NULL OR data->>'category' = 'unknown');