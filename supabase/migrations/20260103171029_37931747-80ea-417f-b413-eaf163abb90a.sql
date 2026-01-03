-- ===================================================================
-- SECURITY FIX: Strengthen Service Role Policies with Explicit Role Check
-- ===================================================================

-- 1. Fix agent_actions - add explicit service_role check
DROP POLICY IF EXISTS "Service role can manage all actions" ON public.agent_actions;
CREATE POLICY "Service role can manage all actions"
  ON public.agent_actions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. Fix agent_goals - add explicit service_role check
DROP POLICY IF EXISTS "Service role can manage all goals" ON public.agent_goals;
CREATE POLICY "Service role can manage all goals"
  ON public.agent_goals
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3. Fix agent_task_queue - add explicit service_role check
DROP POLICY IF EXISTS "Service role can manage task queue" ON public.agent_task_queue;
CREATE POLICY "Service role can manage task queue"
  ON public.agent_task_queue
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. Fix fast_path_patterns - add explicit service_role check
DROP POLICY IF EXISTS "Service role can manage all patterns" ON public.fast_path_patterns;
CREATE POLICY "Service role can manage all patterns"
  ON public.fast_path_patterns
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 5. Fix fast_path_usage_log - add explicit service_role check
DROP POLICY IF EXISTS "Service role can manage usage logs" ON public.fast_path_usage_log;
CREATE POLICY "Service role can manage usage logs"
  ON public.fast_path_usage_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 6. Fix processed_emails - add explicit service_role check  
DROP POLICY IF EXISTS "Service role full access on processed_emails" ON public.processed_emails;
CREATE POLICY "Service role full access on processed_emails"
  ON public.processed_emails
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 7. Fix circuit_breaker_state - remove duplicate, keep only explicit one
DROP POLICY IF EXISTS "Service role full access" ON public.circuit_breaker_state;