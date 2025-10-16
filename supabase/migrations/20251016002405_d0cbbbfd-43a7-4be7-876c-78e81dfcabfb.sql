-- Fix 1: Bulk dismiss oude low-severity alerts (2,242 items)
UPDATE business_intelligence 
SET status = 'dismissed', 
    last_updated_at = NOW()
WHERE severity = 'low' 
  AND status = 'active'
  AND detected_at < NOW() - INTERVAL '7 days';

-- Fix 2: Cleanup orchestrator error states (8 error runs)
DELETE FROM orchestrator_state
WHERE status = 'error'
  AND metadata->>'component' = 'auto-backfill-orchestrator';

-- Fix 2b: Cleanup idle runs zonder component (8 idle runs)
DELETE FROM orchestrator_state
WHERE status = 'idle'
  AND (metadata->>'component' IS NULL OR metadata->>'component' = '');