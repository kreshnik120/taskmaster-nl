-- ===================================================================
-- FASE 15: Security Hardening - Storage Bucket Policy Fix
-- ===================================================================

-- 1. DROP de bestaande te permissive INSERT policy voor application-cvs
DROP POLICY IF EXISTS "System can upload application CVs" ON storage.objects;

-- 2. CREATE nieuwe restrictieve policy (alleen service_role kan uploaden)
-- Dit voorkomt dat anonieme/authenticated users direct kunnen uploaden
CREATE POLICY "Service role can upload application CVs"
  ON storage.objects 
  FOR INSERT
  WITH CHECK (
    bucket_id = 'application-cvs' 
    AND auth.role() = 'service_role'
  );

-- 3. Behoud SELECT policy zodat geautoriseerde gebruikers CVs kunnen bekijken
-- Check of deze al bestaat, zo niet, maak aan
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Authenticated users can view application CVs'
  ) THEN
    CREATE POLICY "Authenticated users can view application CVs"
      ON storage.objects 
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'application-cvs');
  END IF;
END $$;