-- ============================================================
-- Fase 24: Storage Security Hardening
-- ============================================================
-- Fix overly permissive INSERT policy on application-cvs bucket
-- Require service_role OR authenticated user with folder access
-- Add 10MB file size limit to bucket
-- ============================================================

-- Step 1: Drop overly permissive policy
DROP POLICY IF EXISTS "System can upload application CVs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload CVs" ON storage.objects;
DROP POLICY IF EXISTS "Public can upload CVs" ON storage.objects;

-- Step 2: Create stricter policy requiring auth
CREATE POLICY "Service role or user folder CVs" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'application-cvs'
  AND (
    -- Service role (edge functions) can upload anywhere
    auth.role() = 'service_role'
    OR
    -- Authenticated users can only upload to their own folder
    (
      auth.role() = 'authenticated'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
  )
);

-- Step 3: Add file size limit to bucket (10MB max)
UPDATE storage.buckets
SET file_size_limit = 10485760  -- 10MB in bytes
WHERE id = 'application-cvs';

-- Step 4: Ensure bucket exists (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('application-cvs', 'application-cvs', false, 10485760)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = 10485760;

-- ============================================================
-- Verification queries (for manual testing):
-- ============================================================
-- 
-- 1. Check policy exists:
--    SELECT * FROM storage.policies 
--    WHERE table_name = 'objects' 
--    AND bucket_id = 'application-cvs';
-- 
-- 2. Check bucket config:
--    SELECT id, name, public, file_size_limit 
--    FROM storage.buckets 
--    WHERE id = 'application-cvs';
--
-- 3. Test upload as service_role (should work)
-- 4. Test upload as authenticated user to own folder (should work)
-- 5. Test upload as authenticated user to other folder (should fail)
-- 6. Test upload >10MB file (should fail)
-- ============================================================