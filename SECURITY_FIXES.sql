-- ===================================================================
-- SECURITY FIXES - Uit te voeren zodra backend weer bereikbaar is
-- ===================================================================
-- 
-- Deze SQL scripts moeten uitgevoerd worden via Lovable Cloud database
-- migration tool zodra de backend weer online is.
--
-- Datum: 2025-10-23
-- Context: Storage policy aanscherping voor application-cvs bucket
-- ===================================================================

-- 1. DROP de bestaande te permissive policy
DROP POLICY IF EXISTS "System can upload application CVs" ON storage.objects;

-- 2. CREATE nieuwe restrictieve policy (alleen service_role)
CREATE POLICY "Service role can upload application CVs"
  ON storage.objects 
  FOR INSERT
  WITH CHECK (
    bucket_id = 'application-cvs' 
    AND auth.role() = 'service_role'
  );

-- ===================================================================
-- VERIFICATIE STAPPEN (na uitvoeren):
-- ===================================================================
--
-- 1. Test dat edge functions WEL kunnen uploaden:
--    - Trigger een CV upload via edge function
--    - Verwacht: SUCCESS
--
-- 2. Test dat frontend NIET direct kan uploaden:
--    - Probeer direct upload vanuit client
--    - Verwacht: POLICY VIOLATION
--
-- 3. Check policy in dashboard:
--    SELECT * FROM storage.policies 
--    WHERE table_name = 'objects' 
--    AND bucket_id = 'application-cvs';
--
-- ===================================================================
-- ROLLBACK (indien nodig):
-- ===================================================================
--
-- Als er onverwachte issues zijn, gebruik:
-- 
-- DROP POLICY "Service role can upload application CVs" ON storage.objects;
--
-- CREATE POLICY "System can upload application CVs"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'application-cvs');
--
-- ===================================================================

-- 4. VERIFICATIE: Check leaked password protection status
-- Let op: Dit is geen SQL - dit moet je handmatig checken in backend UI
-- 
-- ✅ TODO: Ga naar Backend → Authentication → Password Protection
-- ✅ Zet "Leaked Password Protection" aan indien niet actief
-- ✅ Configureer minimum password strength: Medium of hoger
