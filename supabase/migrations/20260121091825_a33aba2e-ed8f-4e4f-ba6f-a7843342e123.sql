-- Fix Security Error 1: slot_detection_audit - Add org-based SELECT policy
CREATE POLICY "Users can view their org slot detection audits"
ON public.slot_detection_audit
FOR SELECT
TO authenticated
USING (
  org_id IN (
    SELECT uo.org_id 
    FROM user_organizations uo 
    WHERE uo.user_id = auth.uid()
  )
);

-- Fix Security Error 2: intent_classification_audit - Add org-based SELECT policy
CREATE POLICY "Users can view their org intent classification audits"
ON public.intent_classification_audit
FOR SELECT
TO authenticated
USING (
  org_id IN (
    SELECT uo.org_id 
    FROM user_organizations uo 
    WHERE uo.user_id = auth.uid()
  )
);

-- Fix Warning 1: agent_specialists - Replace open policy with authenticated-only
DROP POLICY IF EXISTS "Anyone can read agent specialists" ON public.agent_specialists;

CREATE POLICY "Authenticated users can read agent specialists"
ON public.agent_specialists
FOR SELECT
TO authenticated
USING (true);

-- Fix Warning 2: system_feature_flags - Replace open policy with authenticated-only
DROP POLICY IF EXISTS "Anyone can read feature flags" ON public.system_feature_flags;

CREATE POLICY "Authenticated users can read feature flags"
ON public.system_feature_flags
FOR SELECT
TO authenticated
USING (true);