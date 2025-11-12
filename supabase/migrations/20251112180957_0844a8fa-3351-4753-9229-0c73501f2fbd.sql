-- ==========================================
-- FASE 2: Fix SECURITY DEFINER Views
-- Convert views to SECURITY INVOKER to respect RLS
-- ==========================================

-- 1. Chat Messages View - Convert to SECURITY INVOKER
DROP VIEW IF EXISTS chat_messages CASCADE;

CREATE VIEW chat_messages 
WITH (security_invoker = true)  -- ✅ Respect RLS van ai_chat_messages
AS
SELECT 
  id,
  user_id,
  org_id,
  message_id,
  conversation_id,
  role,
  content,
  used_knowledge,
  jsonb_build_object(
    'knowledge_ids_for_feedback', COALESCE(used_knowledge, '[]'::jsonb),
    'usedKnowledge', COALESCE(used_knowledge, '[]'::jsonb)
  ) AS metadata,
  confidence_score,
  created_at
FROM ai_chat_messages;

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_messages TO authenticated;

-- Grant access to service_role (voor edge functions)
GRANT ALL ON chat_messages TO service_role;

-- 2. Autonomous System Status - Convert to SECURITY INVOKER with org-filtering
DROP VIEW IF EXISTS autonomous_system_status CASCADE;

CREATE VIEW autonomous_system_status
WITH (security_invoker = true)
AS
SELECT 
  'Auto-Harvester'::text AS component,
  (SELECT count(*) FROM ai_knowledge_base kb
   WHERE kb.source LIKE 'auto-harvest%'
   AND EXISTS (SELECT 1 FROM user_organizations uo 
               WHERE uo.org_id = kb.org_id 
               AND uo.user_id = auth.uid())) AS items_generated,
  (SELECT count(*) FROM ai_knowledge_base kb
   WHERE kb.source LIKE 'auto-harvest%' 
   AND kb.created_at >= now() - interval '24 hours'
   AND EXISTS (SELECT 1 FROM user_organizations uo 
               WHERE uo.org_id = kb.org_id 
               AND uo.user_id = auth.uid())) AS items_last_24h,
  (SELECT max(kb.created_at) FROM ai_knowledge_base kb
   WHERE kb.source LIKE 'auto-harvest%'
   AND EXISTS (SELECT 1 FROM user_organizations uo 
               WHERE uo.org_id = kb.org_id 
               AND uo.user_id = auth.uid())) AS last_run
UNION ALL
SELECT 
  'Knowledge Graph'::text,
  (SELECT count(*) FROM knowledge_relationships kr
   JOIN ai_knowledge_base kb ON kb.id = kr.source_knowledge_id
   WHERE EXISTS (SELECT 1 FROM user_organizations uo 
                 WHERE uo.org_id = kb.org_id 
                 AND uo.user_id = auth.uid())),
  (SELECT count(*) FROM knowledge_relationships kr
   JOIN ai_knowledge_base kb ON kb.id = kr.source_knowledge_id
   WHERE kr.created_at >= now() - interval '24 hours'
   AND EXISTS (SELECT 1 FROM user_organizations uo 
               WHERE uo.org_id = kb.org_id 
               AND uo.user_id = auth.uid())),
  (SELECT max(kr.created_at) FROM knowledge_relationships kr
   JOIN ai_knowledge_base kb ON kb.id = kr.source_knowledge_id
   WHERE EXISTS (SELECT 1 FROM user_organizations uo 
                 WHERE uo.org_id = kb.org_id 
                 AND uo.user_id = auth.uid()))
UNION ALL
SELECT 
  'Self-Trainer'::text,
  (SELECT count(*) FROM ai_learning_events ale
   WHERE ale.event_type = 'self_training'
   AND EXISTS (SELECT 1 FROM user_organizations uo 
               WHERE uo.org_id = ale.org_id 
               AND uo.user_id = auth.uid())),
  (SELECT count(*) FROM ai_learning_events ale
   WHERE ale.event_type = 'self_training' 
   AND ale.created_at >= now() - interval '24 hours'
   AND EXISTS (SELECT 1 FROM user_organizations uo 
               WHERE uo.org_id = ale.org_id 
               AND uo.user_id = auth.uid())),
  (SELECT max(ale.created_at) FROM ai_learning_events ale
   WHERE ale.event_type = 'self_training'
   AND EXISTS (SELECT 1 FROM user_organizations uo 
               WHERE uo.org_id = ale.org_id 
               AND uo.user_id = auth.uid()))
UNION ALL
SELECT 
  'Continuous Learner'::text,
  (SELECT count(*) FROM ai_learning_events ale
   WHERE ale.event_type <> 'self_training'
   AND EXISTS (SELECT 1 FROM user_organizations uo 
               WHERE uo.org_id = ale.org_id 
               AND uo.user_id = auth.uid())),
  (SELECT count(*) FROM ai_learning_events ale
   WHERE ale.event_type <> 'self_training' 
   AND ale.created_at >= now() - interval '24 hours'
   AND EXISTS (SELECT 1 FROM user_organizations uo 
               WHERE uo.org_id = ale.org_id 
               AND uo.user_id = auth.uid())),
  (SELECT max(ale.created_at) FROM ai_learning_events ale
   WHERE ale.event_type <> 'self_training'
   AND EXISTS (SELECT 1 FROM user_organizations uo 
               WHERE uo.org_id = ale.org_id 
               AND uo.user_id = auth.uid()));

-- Grant access to authenticated users
GRANT SELECT ON autonomous_system_status TO authenticated;

-- 3. Embedding Coverage Summary - Convert to SECURITY INVOKER with dynamic org-filtering
DROP VIEW IF EXISTS embedding_coverage_summary CASCADE;

CREATE VIEW embedding_coverage_summary
WITH (security_invoker = true)
AS
SELECT 
  o.name AS org_name,
  kb.org_id,
  count(*) AS total_kb_items,
  count(ke.knowledge_id) AS items_with_embeddings,
  (count(*) - count(ke.knowledge_id)) AS items_missing_embeddings,
  round((100.0 * count(ke.knowledge_id)::numeric / NULLIF(count(*), 0)::numeric), 2) AS coverage_percentage
FROM ai_knowledge_base kb
LEFT JOIN knowledge_embeddings ke ON ke.knowledge_id = kb.id
JOIN organizations o ON o.id = kb.org_id
WHERE kb.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM user_organizations uo
    WHERE uo.org_id = kb.org_id
    AND uo.user_id = auth.uid()
  )
GROUP BY kb.org_id, o.name;

-- Grant access to authenticated users
GRANT SELECT ON embedding_coverage_summary TO authenticated;