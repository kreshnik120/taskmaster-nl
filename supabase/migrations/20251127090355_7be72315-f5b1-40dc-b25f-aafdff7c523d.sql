-- Add INSERT policy for application-cvs bucket
-- Allow organization members to upload CV files
CREATE POLICY "Org members can upload application CVs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'application-cvs'
  AND EXISTS (
    SELECT 1 FROM user_organizations uo
    WHERE uo.user_id = auth.uid()
  )
);