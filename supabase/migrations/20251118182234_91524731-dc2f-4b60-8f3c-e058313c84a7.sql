-- PHASE 1 STAP 1: Bulk delete duplicate alerts
-- Behoud alleen de nieuwste alert per (intelligence_type, title) combinatie
DELETE FROM business_intelligence
WHERE id NOT IN (
  SELECT DISTINCT ON (intelligence_type, title, org_id)
    id
  FROM business_intelligence
  WHERE status = 'active'
  ORDER BY intelligence_type, title, org_id, detected_at DESC
)
AND status = 'active';

-- PHASE 1 STAP 3: Prevent future duplicates
-- Add UNIQUE constraint op active alerts
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_alerts 
ON business_intelligence (intelligence_type, title, org_id)
WHERE status = 'active';