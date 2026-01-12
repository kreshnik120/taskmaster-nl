-- Fix: INSERT policy voor authenticated users op application-cvs bucket
-- De bestaande policy is alleen voor service_role, niet voor authenticated users

CREATE POLICY "Authenticated users can upload application CVs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'application-cvs' 
  AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'user'::app_role)
  )
);