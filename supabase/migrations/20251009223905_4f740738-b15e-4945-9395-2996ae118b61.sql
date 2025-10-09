-- P1-6: Bulk re-classify old alerts based on impact_score and title keywords
UPDATE business_intelligence
SET 
  severity = CASE 
    WHEN impact_score > 0.8 OR title ILIKE '%critical%' OR title ILIKE '%error%' OR title ILIKE '%failed%' THEN 'critical'
    WHEN impact_score > 0.6 OR title ILIKE '%warning%' OR title ILIKE '%slow%' THEN 'high'
    WHEN impact_score > 0.4 THEN 'medium'
    ELSE 'low'
  END,
  type = CASE
    WHEN title ILIKE '%quality%' OR title ILIKE '%validation%' OR title ILIKE '%audit%' OR title ILIKE '%duplicate%' THEN 'data_quality'
    WHEN title ILIKE '%knowledge%' OR title ILIKE '%conflict%' OR title ILIKE '%KB%' OR title ILIKE '%categor%' THEN 'knowledge'
    WHEN title ILIKE '%slow%' OR title ILIKE '%timeout%' OR title ILIKE '%performance%' OR title ILIKE '%latency%' THEN 'performance'
    WHEN title ILIKE '%security%' OR title ILIKE '%access%' OR title ILIKE '%auth%' OR title ILIKE '%permission%' THEN 'security'
    ELSE 'alert'
  END
WHERE severity = 'medium' 
  AND type = 'alert';

-- P1-4: Create index for knowledge validation queries
CREATE INDEX IF NOT EXISTS idx_knowledge_needs_review 
  ON ai_knowledge_base(needs_review, validation_status, deleted_at) 
  WHERE deleted_at IS NULL;

-- Add index for validation status filtering
CREATE INDEX IF NOT EXISTS idx_knowledge_validation_status 
  ON ai_knowledge_base(validation_status, org_id) 
  WHERE deleted_at IS NULL;