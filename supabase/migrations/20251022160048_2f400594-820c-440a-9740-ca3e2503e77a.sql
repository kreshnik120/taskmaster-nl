-- ============================================================================
-- PLAN A: Complete Fix voor ai_learning_events.user_id Nullable
-- ============================================================================

-- Stap 1: Backup huidige data voor rollback safety
CREATE TABLE IF NOT EXISTS ai_learning_events_backup_pre_nullable AS
SELECT * FROM ai_learning_events;

-- Stap 2: RLS Policy Fix (KRITIEK - sta NULL user_id toe voor service_role)
DROP POLICY IF EXISTS "Users can insert their own feedback" ON ai_learning_events;

CREATE POLICY "Users can insert their own feedback" 
ON ai_learning_events FOR INSERT
WITH CHECK (
  -- Authenticated users kunnen hun eigen events inserten
  (
    (user_id = auth.uid()) AND
    (EXISTS (SELECT 1 FROM user_organizations 
             WHERE org_id = ai_learning_events.org_id 
             AND user_id = auth.uid()))
  )
  OR
  -- Service role kan system events inserten met NULL user_id
  (
    (user_id IS NULL) AND
    (auth.jwt() ->> 'role' = 'service_role')
  )
);

-- Stap 3: Maak user_id nullable
ALTER TABLE ai_learning_events 
ALTER COLUMN user_id DROP NOT NULL;

-- Voeg comment toe voor documentatie
COMMENT ON COLUMN ai_learning_events.user_id IS 
  'User ID - NULL for system-generated events (service_role only)';

-- Stap 4: Recreate foreign key met ON DELETE SET NULL
ALTER TABLE ai_learning_events 
DROP CONSTRAINT IF EXISTS ai_learning_events_user_id_fkey;

ALTER TABLE ai_learning_events 
ADD CONSTRAINT ai_learning_events_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) 
ON DELETE SET NULL
DEFERRABLE INITIALLY DEFERRED;

-- Stap 5: Index Optimalisatie met partial indexes
DROP INDEX IF EXISTS idx_ai_learning_user_org;

-- Partial index voor user events (user_id NOT NULL)
CREATE INDEX idx_ai_learning_user_org_not_null 
ON ai_learning_events (user_id, org_id, created_at DESC)
WHERE user_id IS NOT NULL;

-- Partial index voor system events (user_id IS NULL)
CREATE INDEX idx_ai_learning_system_events 
ON ai_learning_events (org_id, event_type, created_at DESC)
WHERE user_id IS NULL;

-- Stap 6: Data Quality Check Constraint
ALTER TABLE ai_learning_events 
ADD CONSTRAINT check_user_id_or_system 
CHECK (
  user_id IS NOT NULL OR 
  event_type IN ('auto_validation', 'system_health', 'auto_resolve', 'auto_pruning')
);

-- Stap 7: Monitoring View voor user vs system event ratio
CREATE OR REPLACE VIEW ai_learning_events_summary AS
SELECT 
  event_type,
  COUNT(*) as total_events,
  COUNT(user_id) as user_events,
  COUNT(*) FILTER (WHERE user_id IS NULL) as system_events,
  ROUND(100.0 * COUNT(*) FILTER (WHERE user_id IS NULL) / NULLIF(COUNT(*), 0), 1) as system_event_percentage,
  MAX(created_at) as last_event_at
FROM ai_learning_events
GROUP BY event_type
ORDER BY total_events DESC;

-- Stap 8: Grant permissions op nieuwe view
GRANT SELECT ON ai_learning_events_summary TO authenticated;
GRANT SELECT ON ai_learning_events_summary TO service_role;