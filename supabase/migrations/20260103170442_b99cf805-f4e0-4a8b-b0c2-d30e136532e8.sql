-- ===================================================================
-- SECURITY HARDENING: Kritieke en Hoge Prioriteit Fixes (v3)
-- ===================================================================

-- ===================================================================
-- FASE 1: KRITIEKE FIXES
-- ===================================================================

-- 1.1 Fix specialisme_expert_knowledge RLS
-- Verwijder publieke toegang en beperk tot authenticated users
DROP POLICY IF EXISTS "Anyone can view expert knowledge" ON public.specialisme_expert_knowledge;
DROP POLICY IF EXISTS "Public read access" ON public.specialisme_expert_knowledge;

-- Alleen authenticated users mogen expert knowledge lezen
CREATE POLICY "Authenticated users can view expert knowledge"
  ON public.specialisme_expert_knowledge 
  FOR SELECT
  TO authenticated
  USING (true);

-- ===================================================================
-- FASE 2: HOGE PRIORITEIT FIXES
-- ===================================================================

-- 2.1 Fix processed_emails RLS - org_id bestaat, voeg org-based SELECT policy toe
DROP POLICY IF EXISTS "Anyone can view processed emails" ON public.processed_emails;
DROP POLICY IF EXISTS "Public read access" ON public.processed_emails;

CREATE POLICY "Org members can view processed emails"
  ON public.processed_emails 
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations 
      WHERE user_organizations.org_id = processed_emails.org_id 
      AND user_organizations.user_id = auth.uid()
    )
  );

-- 2.2 Fix circuit_breaker_state RLS - geen org_id, admin-only
ALTER TABLE public.circuit_breaker_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view circuit breaker state" ON public.circuit_breaker_state;
DROP POLICY IF EXISTS "Public read access" ON public.circuit_breaker_state;

-- Admin-only policy voor circuit breaker state
CREATE POLICY "Admins can view circuit breaker state"
  ON public.circuit_breaker_state 
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Service role mag ook lezen/schrijven voor backend operaties
CREATE POLICY "Service role full access to circuit breaker"
  ON public.circuit_breaker_state
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2.3 Storage policies: verwijder brede policies, behoud service_role policies die al bestaan
DROP POLICY IF EXISTS "Authenticated users can upload CVs" ON storage.objects;
DROP POLICY IF EXISTS "System can upload application CVs" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload application CVs" ON storage.objects;

-- Authenticated users mogen wel lezen (voor download links)
DROP POLICY IF EXISTS "Authenticated users can read application CVs" ON storage.objects;
DROP POLICY IF EXISTS "Org members can read application CVs" ON storage.objects;

CREATE POLICY "Authenticated can read application CVs"
  ON storage.objects 
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'application-cvs');