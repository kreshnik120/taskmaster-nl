-- ===================================================================
-- FIX: CV Upload RLS Policies voor application-cvs bucket
-- ===================================================================
-- Root cause: Alleen service_role had toegang, authenticated users niet
-- Solution: Voeg role-based policies toe voor authenticated users
-- ===================================================================

-- 1. DROP bestaande restrictieve policies
DROP POLICY IF EXISTS "Service role can upload application CVs" ON storage.objects;
DROP POLICY IF EXISTS "System can upload application CVs" ON storage.objects;
DROP POLICY IF EXISTS "Service role can manage application CVs" ON storage.objects;

-- 2. CREATE nieuwe role-based policies voor authenticated users

-- INSERT: Admins, recruiters, en editors kunnen CVs uploaden
CREATE POLICY "Authenticated users can upload CVs"
ON storage.objects 
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'application-cvs' 
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'user')
  )
);

-- SELECT: Alle authenticated users kunnen CVs bekijken
CREATE POLICY "Authenticated users can view CVs"
ON storage.objects 
FOR SELECT
TO authenticated
USING (
  bucket_id = 'application-cvs'
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'user')
  )
);

-- UPDATE: Admins, recruiters, en editors kunnen CVs updaten
CREATE POLICY "Authenticated users can update CVs"
ON storage.objects 
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'application-cvs'
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'user')
  )
)
WITH CHECK (
  bucket_id = 'application-cvs'
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'manager')
    OR has_role(auth.uid(), 'user')
  )
);

-- DELETE: Alleen admins kunnen CVs verwijderen
CREATE POLICY "Admins can delete CVs"
ON storage.objects 
FOR DELETE
TO authenticated
USING (
  bucket_id = 'application-cvs'
  AND has_role(auth.uid(), 'admin')
);

-- ===================================================================
-- VERIFICATIE STAPPEN (na uitvoeren):
-- ===================================================================
--
-- 1. Test CV upload als authenticated user:
--    - Open ApplicationDetailModal
--    - Upload een test PDF
--    - Verwacht: "CV succesvol geüpload" toast
--
-- 2. Test CV download:
--    - Klik op "Download CV" knop
--    - Verwacht: PDF download start
--
-- 3. Test CV view:
--    - Klik op "Bekijk CV" knop
--    - Verwacht: PDF opent in nieuwe tab
--
-- 4. Check policies in dashboard:
--    SELECT * FROM storage.policies 
--    WHERE table_name = 'objects' 
--    AND bucket_id = 'application-cvs';
--
-- ===================================================================