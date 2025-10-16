-- Dismiss 32 duplicate broken_sources alerts, behoud alleen de meest recente
WITH latest_alert AS (
  SELECT id
  FROM business_intelligence
  WHERE intelligence_type = 'broken_sources'
    AND severity = 'critical'
    AND status = 'active'
  ORDER BY detected_at DESC
  LIMIT 1
)
UPDATE business_intelligence
SET status = 'dismissed',
    last_updated_at = NOW()
WHERE intelligence_type = 'broken_sources'
  AND severity = 'critical'
  AND status = 'active'
  AND id NOT IN (SELECT id FROM latest_alert);