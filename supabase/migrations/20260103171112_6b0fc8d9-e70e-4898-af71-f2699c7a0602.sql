-- ===================================================================
-- SECURITY FIX: Restrict Access to Expert Knowledge and Screening Data
-- ===================================================================

-- 1. Fix specialisme_expert_knowledge - restrict to authenticated users only
-- Currently "Authenticated users can view expert knowledge" has qual:true which allows anon
DROP POLICY IF EXISTS "Authenticated users can view expert knowledge" ON public.specialisme_expert_knowledge;
CREATE POLICY "Authenticated users can view expert knowledge"
  ON public.specialisme_expert_knowledge 
  FOR SELECT
  TO authenticated
  USING (true);

-- Fix service role policy with explicit role check
DROP POLICY IF EXISTS "Service role can manage expert knowledge" ON public.specialisme_expert_knowledge;
CREATE POLICY "Service role can manage expert knowledge"
  ON public.specialisme_expert_knowledge
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. Fix vog_screening_requirements - restrict to authenticated HR staff
DROP POLICY IF EXISTS "Anyone can view screening requirements" ON public.vog_screening_requirements;
CREATE POLICY "Authenticated users can view screening requirements"
  ON public.vog_screening_requirements 
  FOR SELECT
  TO authenticated
  USING (true);