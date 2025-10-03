-- Enable required extensions for autonomous scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- ULTRA-AUTONOMOUS CRON JOBS (Active until 2025-10-06 23:59:59)
-- ============================================================================

-- 1. MEGA AUTO-HARVESTER: Every 2 hours (36x per dag = 108 runs tot 6 okt)
SELECT cron.schedule(
  'ultra-auto-harvester',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/auto-knowledge-harvester',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0'
    ),
    body := jsonb_build_object('trigger', 'cron', 'timestamp', now())
  ) as request_id;
  $$
);

-- 2. HYPER KNOWLEDGE GRAPH: Every 6 hours (12x per dag = 36 runs tot 6 okt)
SELECT cron.schedule(
  'ultra-knowledge-graph',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/knowledge-graph-builder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0'
    ),
    body := jsonb_build_object(
      'batch_size', 200,
      'parallel_mode', true,
      'trigger', 'cron'
    )
  ) as request_id;
  $$
);

-- 3. SELF-TRAINING LOOP: Every 2 hours (36x per dag = 108 runs tot 6 okt)
SELECT cron.schedule(
  'ultra-self-trainer',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/self-trainer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0'
    ),
    body := jsonb_build_object('mode', 'autonomous', 'trigger', 'cron')
  ) as request_id;
  $$
);

-- 4. DAILY PERFORMANCE REPORT: Every 24 hours (3 runs tot 6 okt)
SELECT cron.schedule(
  'ultra-daily-report',
  '0 0 * * *',
  $$
  WITH stats AS (
    SELECT 
      COUNT(*) as total_knowledge,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as new_today,
      AVG(confidence_score) as avg_confidence,
      COUNT(*) FILTER (WHERE needs_review = true) as needs_review_count
    FROM ai_knowledge_base
    WHERE deleted_at IS NULL
  ),
  relationship_stats AS (
    SELECT COUNT(*) as total_relationships
    FROM knowledge_relationships
  )
  SELECT 
    jsonb_build_object(
      'date', CURRENT_DATE,
      'knowledge_items', s.total_knowledge,
      'new_items_24h', s.new_today,
      'avg_confidence', ROUND(s.avg_confidence::numeric, 2),
      'needs_review', s.needs_review_count,
      'relationships', r.total_relationships,
      'status', 'autonomous_learning_active'
    )
  FROM stats s, relationship_stats r;
  $$
);

-- ============================================================================
-- DATABASE TRIGGERS FOR REAL-TIME AUTONOMOUS LEARNING
-- ============================================================================

-- Trigger 1: Auto-call continuous-learner after every assistant chat message
CREATE OR REPLACE FUNCTION trigger_continuous_learner()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger for assistant messages
  IF NEW.role = 'assistant' THEN
    PERFORM net.http_post(
      url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/continuous-learner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0'
      ),
      body := jsonb_build_object(
        'user_question', (SELECT content FROM chat_messages WHERE id = NEW.id - 1 AND conversation_id = NEW.conversation_id),
        'ai_response', NEW.content,
        'trigger', 'auto',
        'message_id', NEW.id
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_chat_message_autonomous_learning
AFTER INSERT ON chat_messages
FOR EACH ROW
EXECUTE FUNCTION trigger_continuous_learner();

-- Trigger 2: Auto-process documents when uploaded to training-documents bucket
CREATE OR REPLACE FUNCTION trigger_document_processing()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger for training-documents bucket
  IF NEW.bucket_id = 'training-documents' THEN
    PERFORM net.http_post(
      url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/vision-document-processor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0'
      ),
      body := jsonb_build_object(
        'storage_path', NEW.name,
        'document_type', 'auto_detect',
        'trigger', 'auto_upload'
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_document_upload_auto_process
AFTER INSERT ON storage.objects
FOR EACH ROW
EXECUTE FUNCTION trigger_document_processing();

-- ============================================================================
-- MONITORING & SAFETY: Create view for autonomous system status
-- ============================================================================

CREATE OR REPLACE VIEW autonomous_system_status AS
SELECT 
  'Auto-Harvester' as component,
  (SELECT COUNT(*) FROM ai_knowledge_base WHERE source LIKE 'auto-harvest%') as items_generated,
  (SELECT COUNT(*) FROM ai_knowledge_base WHERE source LIKE 'auto-harvest%' AND created_at >= NOW() - INTERVAL '24 hours') as items_last_24h,
  (SELECT MAX(created_at) FROM ai_knowledge_base WHERE source LIKE 'auto-harvest%') as last_run
UNION ALL
SELECT 
  'Knowledge Graph' as component,
  (SELECT COUNT(*) FROM knowledge_relationships) as items_generated,
  (SELECT COUNT(*) FROM knowledge_relationships WHERE created_at >= NOW() - INTERVAL '24 hours') as items_last_24h,
  (SELECT MAX(created_at) FROM knowledge_relationships) as last_run
UNION ALL
SELECT 
  'Self-Trainer' as component,
  (SELECT COUNT(*) FROM ai_learning_events WHERE event_type = 'self_training') as items_generated,
  (SELECT COUNT(*) FROM ai_learning_events WHERE event_type = 'self_training' AND created_at >= NOW() - INTERVAL '24 hours') as items_last_24h,
  (SELECT MAX(created_at) FROM ai_learning_events WHERE event_type = 'self_training') as last_run
UNION ALL
SELECT 
  'Continuous Learner' as component,
  (SELECT COUNT(*) FROM ai_learning_events WHERE event_type != 'self_training') as items_generated,
  (SELECT COUNT(*) FROM ai_learning_events WHERE event_type != 'self_training' AND created_at >= NOW() - INTERVAL '24 hours') as items_last_24h,
  (SELECT MAX(created_at) FROM ai_learning_events WHERE event_type != 'self_training') as last_run;

COMMENT ON VIEW autonomous_system_status IS 'Real-time monitoring of ULTRA autonomous learning system';
