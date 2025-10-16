-- Reset stuck auto-backfill runs (heartbeat timeout > 5 min)
UPDATE orchestrator_state
SET status = 'error',
    metadata = jsonb_set(
      jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{error}',
        '"Heartbeat timeout - automatically recovered"'::jsonb
      ),
      '{recovered_at}',
      to_jsonb(NOW()::text)
    )
WHERE metadata->>'component' = 'auto-backfill-orchestrator'
  AND status = 'running'
  AND (metadata->>'last_heartbeat')::timestamp < (NOW() - INTERVAL '5 minutes');