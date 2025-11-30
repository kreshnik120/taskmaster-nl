-- Storage Security Fix: Remove all remaining public CV policies
-- Only service_role should have CV access

-- Drop all old public CV policies
DROP POLICY IF EXISTS "Service role or user folder CVs" ON storage.objects;
DROP POLICY IF EXISTS "Org members can view application CVs" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update application CVs" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete application CVs" ON storage.objects;

-- Create restrictive policies for service_role only
CREATE POLICY "Service role can view CVs" ON storage.objects
FOR SELECT TO service_role
USING (bucket_id = 'application-cvs');

CREATE POLICY "Service role can update CVs" ON storage.objects
FOR UPDATE TO service_role
USING (bucket_id = 'application-cvs');

CREATE POLICY "Service role can delete CVs" ON storage.objects
FOR DELETE TO service_role
USING (bucket_id = 'application-cvs');