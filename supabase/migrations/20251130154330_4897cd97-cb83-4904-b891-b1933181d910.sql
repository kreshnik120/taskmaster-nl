-- Storage Policy Fix: Restrict CV uploads to service_role only
-- Drop both existing policies
DROP POLICY IF EXISTS "Org members can upload application CVs" ON storage.objects;
DROP POLICY IF EXISTS "Service role can upload CVs" ON storage.objects;

-- Create new restrictive policy for service_role only
CREATE POLICY "Service role uploads application CVs" ON storage.objects
FOR INSERT TO service_role
WITH CHECK (bucket_id = 'application-cvs');