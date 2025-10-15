-- Cleanup: Force beide conflicterende runs naar 'error' status
UPDATE orchestrator_state
SET 
  status = 'error',
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{error}',
    '"Duplicate run detected - beide gestopt om conflict te vermijden"'
  ) || jsonb_build_object(
    'force_stopped_at', NOW()::text,
    'reason', 'duplicate_run_cleanup'
  )
WHERE id IN (
  '78f9128c-aa75-4d04-809b-56af7af12dfd',
  'bb39a67f-c57e-47f6-8168-71695b6795ab'
) AND status = 'running';

-- Preventie: UNIQUE constraint om te voorkomen dat meerdere 'running' runs tegelijk kunnen bestaan
CREATE UNIQUE INDEX IF NOT EXISTS idx_orchestrator_single_running
ON orchestrator_state (org_id, (metadata->>'component'))
WHERE status = 'running';