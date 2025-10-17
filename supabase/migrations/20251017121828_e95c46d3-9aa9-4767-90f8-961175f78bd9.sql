-- Archive old paused orchestrator runs (older than 1 hour)
UPDATE orchestrator_state
SET 
  status = 'idle',
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{archived_reason}',
    '"Archived due to being paused for over 1 hour"'::jsonb
  )
WHERE 
  status = 'paused'
  AND last_run_at < NOW() - INTERVAL '1 hour';