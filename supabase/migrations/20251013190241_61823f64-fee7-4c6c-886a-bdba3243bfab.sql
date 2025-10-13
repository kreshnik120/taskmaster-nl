-- STAP 1: Reset gestopte auto-backfill run
UPDATE orchestrator_state 
SET status = 'error',
    metadata = jsonb_set(
      metadata, 
      '{error}', 
      '"Timeout na batch 14 - fixed with timeout logic"'
    )
WHERE id = '1c766d16-a5ff-41a1-9997-76cd49bb3f32';