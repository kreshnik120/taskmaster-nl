-- =====================================================
-- Fix 5 Critical Security Errors - Correct RLS Policies
-- =====================================================

-- Fix 1: slot_detection_audit - Service role policy was granting public access
DROP POLICY IF EXISTS "Service role full access on slot_detection_audit" ON public.slot_detection_audit;

CREATE POLICY "Service role full access on slot_detection_audit"
ON public.slot_detection_audit
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Fix 2: intent_classification_audit - Service role policy was granting public access
DROP POLICY IF EXISTS "Service role full access on intent_classification_audit" ON public.intent_classification_audit;

CREATE POLICY "Service role full access on intent_classification_audit"
ON public.intent_classification_audit
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Fix 3: agent_execution_traces - Fix both service role and user policies
DROP POLICY IF EXISTS "Service role can manage all execution traces" ON public.agent_execution_traces;

CREATE POLICY "Service role can manage all execution traces"
ON public.agent_execution_traces
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view their org execution traces" ON public.agent_execution_traces;

CREATE POLICY "Users can view their org execution traces"
ON public.agent_execution_traces
FOR SELECT
TO authenticated
USING (
  org_id IN (
    SELECT uo.org_id 
    FROM user_organizations uo 
    WHERE uo.user_id = auth.uid()
  )
);

-- Fix 4: tool_stability_scores - Remove OR org_id IS NULL leak
DROP POLICY IF EXISTS "Service role can manage tool stability scores" ON public.tool_stability_scores;

CREATE POLICY "Service role can manage tool stability scores"
ON public.tool_stability_scores
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view tool stability scores" ON public.tool_stability_scores;

CREATE POLICY "Users can view tool stability scores"
ON public.tool_stability_scores
FOR SELECT
TO authenticated
USING (
  org_id IN (
    SELECT uo.org_id 
    FROM user_organizations uo 
    WHERE uo.user_id = auth.uid()
  )
);

-- Fix 5: react_agent_config - Remove OR org_id IS NULL leak
DROP POLICY IF EXISTS "Service role can manage config" ON public.react_agent_config;

CREATE POLICY "Service role can manage config"
ON public.react_agent_config
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view their org config" ON public.react_agent_config;

CREATE POLICY "Users can view their org config"
ON public.react_agent_config
FOR SELECT
TO authenticated
USING (
  org_id IN (
    SELECT uo.org_id 
    FROM user_organizations uo 
    WHERE uo.user_id = auth.uid()
  )
);