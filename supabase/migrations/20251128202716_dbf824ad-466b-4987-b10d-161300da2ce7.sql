-- ===================================================================
-- FASE 30: Storage Bucket Security Hardening
-- ===================================================================
-- Fix overpermissive application-cvs bucket policies
-- Restrict INSERT to service_role only and add file limits
-- ===================================================================

-- 1. DROP de bestaande te permissieve policy
DROP POLICY IF EXISTS "System can upload application CVs" ON storage.objects;

-- 2. CREATE nieuwe restrictieve policy (alleen service_role mag uploaden)
CREATE POLICY "Service role can upload CVs" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'application-cvs'
  AND auth.role() = 'service_role'
);

-- 3. UPDATE bucket configuratie met file limits en MIME type restrictions
UPDATE storage.buckets
SET 
  file_size_limit = 10485760,  -- 10MB max per file
  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  -- .docx
    'application/msword'  -- .doc
  ]
WHERE id = 'application-cvs';

-- ===================================================================
-- VERIFICATIE:
-- ===================================================================
-- Na uitvoeren, verifieer dat:
-- 1. Edge functions WEL kunnen uploaden (service_role)
-- 2. Frontend NIET direct kan uploaden (anon role)
-- 3. File size limit van 10MB actief is
-- 4. Alleen PDF en Word documenten worden geaccepteerd
-- ===================================================================