
-- Fix: Reset old error runs and prepare for fresh backfill start
-- This migration cleans up stale orchestrator runs and provides a clean slate

-- Step 1: Archive old stale auto-backfill runs by updating their metadata
UPDATE orchestrator_state
SET 
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{archived_at}',
    to_jsonb(NOW()::text)
  )
WHERE 
  metadata->>'component' = 'auto-backfill-orchestrator'
  AND status IN ('error', 'paused', 'running')
  AND last_run_at < NOW() - INTERVAL '1 day';

-- Step 2: Add comment explaining the fix
COMMENT ON TABLE orchestrator_state IS 
'Orchestrator state tracking table. auto-backfill-orchestrator uses component=auto-backfill-orchestrator in metadata. 
Status paused = waiting for restart, error = failed, running = active, idle = completed.
Auto-restart-backfill cron job (every 5 min) automatically restarts paused/stale runs.';

-- Step 3: Ensure system_health_log tracks embedding coverage correctly
-- (This is already handled by system-health-monitor, but we add a helper view)
CREATE OR REPLACE VIEW embedding_coverage_summary AS
SELECT 
  'ABCzorg' as org_name,
  '550e8400-e29b-41d4-a716-446655440000'::uuid as org_id,
  COUNT(*) as total_kb_items,
  COUNT(ke.knowledge_id) as items_with_embeddings,
  COUNT(*) - COUNT(ke.knowledge_id) as items_missing_embeddings,
  ROUND(100.0 * COUNT(ke.knowledge_id) / NULLIF(COUNT(*), 0), 2) as coverage_percentage
FROM ai_knowledge_base kb
LEFT JOIN knowledge_embeddings ke ON ke.knowledge_id = kb.id
WHERE kb.deleted_at IS NULL
  AND kb.org_id = '550e8400-e29b-41d4-a716-446655440000'
GROUP BY org_id;

-- Grant access to authenticated users
GRANT SELECT ON embedding_coverage_summary TO authenticated;

COMMENT ON VIEW embedding_coverage_summary IS 
'Real-time view of embedding coverage. 
Goal: >95% coverage (5700+ of 5994 items).
Current system: ~7% coverage (424 items).
Backfill orchestrator will process remaining 5570 items in batches of 25-200.';
