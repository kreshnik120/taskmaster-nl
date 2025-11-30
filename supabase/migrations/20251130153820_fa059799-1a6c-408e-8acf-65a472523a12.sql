-- ===================================================================
-- FASE 1B: Fix Resterende Security Issues (Corrected)
-- ===================================================================
-- 
-- Fix de resterende gevaarlijke public policies
-- 
-- Datum: 2025-11-30
-- ===================================================================

-- FIX 1: system_events heeft nog steeds public role in policy
-- Drop ALLE bestaande policies en maak alleen correcte service_role policy
DROP POLICY IF EXISTS "Service role can manage all events" ON public.system_events;
DROP POLICY IF EXISTS "System can manage all events" ON public.system_events;
DROP POLICY IF EXISTS "Users can only view events in their organization" ON public.system_events;

-- Service role needs full access for event logging
CREATE POLICY "Service role manages events"
  ON public.system_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Org members can view their own events (read-only)
CREATE POLICY "Org members view events"
  ON public.system_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.org_id = system_events.org_id
      AND user_organizations.user_id = auth.uid()
    )
  );


-- FIX 2: tags table heeft gevaarlijke "Users can view all tags" policy
-- Tags zijn shared across all orgs, maar alleen authenticated users mogen ze zien
DROP POLICY IF EXISTS "Users can view all tags" ON public.tags;

-- Only authenticated users can view tags
CREATE POLICY "Authenticated users view tags"
  ON public.tags
  FOR SELECT
  TO authenticated
  USING (true);


-- ===================================================================
-- FINAL VERIFICATIE:
-- ===================================================================
-- 
-- SELECT tablename, policyname, roles::text, qual 
-- FROM pg_policies 
-- WHERE schemaname = 'public' 
-- AND qual = 'true' 
-- AND 'public' = ANY(roles);
--
-- Verwacht: 0 rijen (alle public+qual:true policies verwijderd)
--
-- ===================================================================