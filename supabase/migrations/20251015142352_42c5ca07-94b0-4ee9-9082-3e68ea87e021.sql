-- ============================================
-- FIX: Reset vastgelopen auto-backfill orchestrator run
-- ============================================
-- De run is vastgelopen na batch 28 op 2025-10-14 10:25:08
-- Heartbeat is >24h oud, dus we resetten naar 'error' status

UPDATE orchestrator_state 
SET 
  status = 'error',
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{error}',
      '"Timeout na batch 28 - heartbeat stale >24h (last: 2025-10-14 10:25:08). Reset door gebruiker."'::jsonb
    ),
    '{reset_at}',
    to_jsonb(now()::text)
  )
WHERE id = '5b63aed8-211a-49ea-b376-4b00cbd8ffa7'
  AND status = 'running';

-- Verificatie
DO $$
BEGIN
  RAISE NOTICE '✅ Vastgelopen auto-backfill run gereset - nieuwe run kan nu starten';
END $$;