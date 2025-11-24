-- ========================================
-- PRODUCTIE CLEANUP: Verwijder test data
-- ========================================

-- FASE 1: Verwijder task-gerelateerde data (correcte volgorde ivm foreign keys)

-- 1a. Verwijder comments
DELETE FROM comments;

-- 1b. Verwijder time entries
DELETE FROM time_entries;

-- 1c. Verwijder subtasks
DELETE FROM subtasks;

-- 1d. Verwijder attachments
DELETE FROM attachments;

-- 1e. Verwijder dependencies
DELETE FROM dependencies;

-- 1f. Verwijder alle taken
DELETE FROM tasks;

-- 1g. Reset task sequence voor fresh start (volgende taak krijgt #1)
ALTER SEQUENCE tasks_sequence_number_seq RESTART WITH 1;

-- FASE 2: Logs & Cache Cleanup (Performance)

-- 2a. Verwijder oude function call logs (ouder dan 7 dagen)
DELETE FROM function_call_logs 
WHERE created_at < NOW() - INTERVAL '7 days';

-- 2b. Verwijder oude AI learning events logs (ouder dan 30 dagen, niet toegepaste lessen)
DELETE FROM ai_learning_events 
WHERE created_at < NOW() - INTERVAL '30 days'
  AND applied_to_knowledge_base = false;

-- 2c. Verwijder oude embedding logs (ouder dan 7 dagen)
DELETE FROM embedding_generation_log 
WHERE created_at < NOW() - INTERVAL '7 days';

-- 2d. Flush expired cache entries
DELETE FROM ai_response_cache 
WHERE expires_at < NOW();

-- 2e. Cleanup oude KvK cache (ouder dan 30 dagen)
DELETE FROM kvk_validation_cache 
WHERE created_at < NOW() - INTERVAL '30 days';

-- FASE 3: Performance Indices

-- Tasks performance indices
CREATE INDEX IF NOT EXISTS idx_tasks_org_status 
  ON tasks(org_id, completed_at, deleted_at);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee 
  ON tasks(assignee_id) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_due_date 
  ON tasks(due_at) 
  WHERE completed_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_priority 
  ON tasks(priority, created_at DESC) 
  WHERE deleted_at IS NULL;

-- AI Knowledge Base performance indices
CREATE INDEX IF NOT EXISTS idx_knowledge_category 
  ON ai_knowledge_base(category) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_org_validation 
  ON ai_knowledge_base(org_id, validation_status) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_confidence 
  ON ai_knowledge_base(confidence_score DESC) 
  WHERE deleted_at IS NULL AND validation_status = 'verified';

CREATE INDEX IF NOT EXISTS idx_knowledge_usage 
  ON ai_knowledge_base(usage_count DESC, last_used_at DESC) 
  WHERE deleted_at IS NULL;

-- Time entries performance index
CREATE INDEX IF NOT EXISTS idx_time_entries_user_date 
  ON time_entries(user_id, start DESC);

-- Clients index
CREATE INDEX IF NOT EXISTS idx_clients_org_tier 
  ON clients(org_id, tier, company);

-- FASE 4: Cleanup Function voor automatische maintenance

CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cleanup logs ouder dan 30 dagen
  DELETE FROM function_call_logs WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM embedding_generation_log WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Cleanup expired cache
  DELETE FROM ai_response_cache WHERE expires_at < NOW();
  DELETE FROM kvk_validation_cache WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;