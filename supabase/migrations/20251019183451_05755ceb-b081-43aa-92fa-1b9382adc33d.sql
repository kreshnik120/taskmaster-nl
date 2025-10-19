-- FASE 1: Merge 12 Source-Issue Alerts → 1 Master Alert
-- Stap 1: Creëer master alert met historische data
INSERT INTO business_intelligence (
  org_id,
  intelligence_type,
  type,
  severity,
  status,
  title,
  description,
  detected_at,
  data
) 
SELECT 
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'broken_sources',
  'broken_sources_structural',
  'critical',
  'active',
  'Structural Issue: 80%+ Sources Failing',
  'Multiple source validation runs detected consistent failure rate of 80-88% across 60+ sources. This is a systemic issue requiring immediate attention.',
  NOW(),
  jsonb_build_object(
    'category', 'source_issue',
    'detection_history', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'count', COALESCE((data->>'broken_count')::int, 0),
          'timestamp', detected_at,
          'percentage', COALESCE((data->>'failure_percentage')::float, 0)
        ) ORDER BY detected_at
      )
      FROM business_intelligence
      WHERE org_id = '550e8400-e29b-41d4-a716-446655440000'
        AND severity = 'critical'
        AND status = 'active'
        AND COALESCE(data->>'category', '') = 'source_issue'
    ),
    'total_detections', (
      SELECT COUNT(*) 
      FROM business_intelligence
      WHERE org_id = '550e8400-e29b-41d4-a716-446655440000'
        AND severity = 'critical'
        AND status = 'active'
        AND COALESCE(data->>'category', '') = 'source_issue'
    ),
    'first_detected', (
      SELECT MIN(detected_at) FROM business_intelligence
      WHERE org_id = '550e8400-e29b-41d4-a716-446655440000'
        AND severity = 'critical'
        AND status = 'active'
        AND COALESCE(data->>'category', '') = 'source_issue'
    ),
    'last_detected', NOW(),
    'avg_broken_sources', (
      SELECT ROUND(AVG(COALESCE((data->>'broken_count')::int, 0)))
      FROM business_intelligence
      WHERE org_id = '550e8400-e29b-41d4-a716-446655440000'
        AND severity = 'critical'
        AND status = 'active'
        AND COALESCE(data->>'category', '') = 'source_issue'
    )
  )
WHERE EXISTS (
  SELECT 1 FROM business_intelligence
  WHERE org_id = '550e8400-e29b-41d4-a716-446655440000'
    AND severity = 'critical'
    AND status = 'active'
    AND COALESCE(data->>'category', '') = 'source_issue'
);

-- Stap 2: Resolve oude alerts
UPDATE business_intelligence
SET 
  status = 'resolved',
  data = jsonb_set(
    COALESCE(data, '{}'::jsonb),
    '{resolved_reason}',
    '"Merged into master alert: Structural Issue: 80%+ Sources Failing"'
  )
WHERE org_id = '550e8400-e29b-41d4-a716-446655440000'
  AND severity = 'critical'
  AND status = 'active'
  AND COALESCE(data->>'category', '') = 'source_issue';

-- FASE 3: Add Source Validation Tracking Columns
ALTER TABLE ai_knowledge_base
ADD COLUMN IF NOT EXISTS source_status TEXT DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS last_source_check TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS source_check_failures INT DEFAULT 0;

-- Index voor snelle lookup
CREATE INDEX IF NOT EXISTS idx_source_status 
ON ai_knowledge_base(source_status, last_source_check) 
WHERE deleted_at IS NULL;