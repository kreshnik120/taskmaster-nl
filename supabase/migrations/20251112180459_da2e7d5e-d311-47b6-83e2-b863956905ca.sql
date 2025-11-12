-- ==========================================
-- FASE 1: Critical RLS Fixes
-- Fix public access on AI tables - change TO public to TO authenticated
-- ==========================================

-- 1. AI Categories - Business Intelligence (1,040 items)
DROP POLICY IF EXISTS "Org members can view categories" ON ai_categories;
DROP POLICY IF EXISTS "System can manage categories" ON ai_categories;

CREATE POLICY "Org members can view categories"
  ON ai_categories FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = ai_categories.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage categories"
  ON ai_categories FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. AI Meta Patterns - 25,708 Proprietary AI Patterns
DROP POLICY IF EXISTS "Admins can view meta patterns" ON ai_meta_patterns;
DROP POLICY IF EXISTS "System can manage meta patterns" ON ai_meta_patterns;

CREATE POLICY "Admins can view meta patterns"
  ON ai_meta_patterns FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin') AND
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = ai_meta_patterns.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage meta patterns"
  ON ai_meta_patterns FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. AI Response Cache - Customer Conversations (36 items)
DROP POLICY IF EXISTS "Users can read cache in their org" ON ai_response_cache;
DROP POLICY IF EXISTS "System can manage cache" ON ai_response_cache;

CREATE POLICY "Users can read cache in their org"
  ON ai_response_cache FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = ai_response_cache.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage cache"
  ON ai_response_cache FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Knowledge Embeddings - 4,221 Proprietary Vectors
DROP POLICY IF EXISTS "Users can read embeddings in their org" ON knowledge_embeddings;
DROP POLICY IF EXISTS "System can manage embeddings" ON knowledge_embeddings;

CREATE POLICY "Users can read embeddings in their org"
  ON knowledge_embeddings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ai_knowledge_base kb
      JOIN user_organizations uo ON uo.org_id = kb.org_id
      WHERE kb.id = knowledge_embeddings.knowledge_id
        AND uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage embeddings"
  ON knowledge_embeddings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Orchestrator State - System Processing Info
DROP POLICY IF EXISTS "Admins can view orchestrator state" ON orchestrator_state;
DROP POLICY IF EXISTS "System can manage orchestrator state" ON orchestrator_state;

CREATE POLICY "Admins can view orchestrator state"
  ON orchestrator_state FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin') AND
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = orchestrator_state.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage orchestrator state"
  ON orchestrator_state FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. Processing Jobs - Document Processing
DROP POLICY IF EXISTS "Users can view their own jobs" ON processing_jobs;
DROP POLICY IF EXISTS "Users can insert their own jobs" ON processing_jobs;
DROP POLICY IF EXISTS "System can manage all jobs" ON processing_jobs;

CREATE POLICY "Users can view their own jobs"
  ON processing_jobs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own jobs"
  ON processing_jobs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role can manage all jobs"
  ON processing_jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 7. AI Performance Metrics - Admin Only
DROP POLICY IF EXISTS "Only admins can view performance metrics" ON ai_performance_metrics;
DROP POLICY IF EXISTS "System can manage metrics" ON ai_performance_metrics;

CREATE POLICY "Only admins can view performance metrics"
  ON ai_performance_metrics FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin') AND
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = ai_performance_metrics.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage metrics"
  ON ai_performance_metrics FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);