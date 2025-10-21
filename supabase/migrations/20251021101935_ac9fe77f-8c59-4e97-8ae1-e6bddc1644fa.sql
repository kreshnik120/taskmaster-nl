-- Cleanup oude orchestrator runs die nieuwe runs blokkeren
UPDATE orchestrator_state
SET 
  status = 'error',
  error_message = 'Cleaned up by automated fix - stale paused run',
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{cleaned_at}',
    to_jsonb(now()::text)
  )
WHERE status IN ('paused', 'running')
  AND org_id = '550e8400-e29b-41d4-a716-446655440000'
  AND last_run_at < NOW() - INTERVAL '10 minutes';