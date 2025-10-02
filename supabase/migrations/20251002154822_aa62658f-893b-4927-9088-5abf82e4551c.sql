-- Create storage bucket for application CVs
INSERT INTO storage.buckets (id, name, public)
VALUES ('application-cvs', 'application-cvs', false);

-- RLS policies for application-cvs bucket
-- Org members can view CVs
CREATE POLICY "Org members can view application CVs"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'application-cvs' 
  AND EXISTS (
    SELECT 1
    FROM professional_applications pa
    JOIN user_organizations uo ON uo.org_id = pa.org_id
    WHERE pa.cv_file_path = name
      AND uo.user_id = auth.uid()
  )
);

-- Org members can upload CVs (for edge function with service role)
CREATE POLICY "System can upload application CVs"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'application-cvs'
);

-- Org members can update CVs
CREATE POLICY "Org members can update application CVs"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'application-cvs'
  AND EXISTS (
    SELECT 1
    FROM professional_applications pa
    JOIN user_organizations uo ON uo.org_id = pa.org_id
    WHERE pa.cv_file_path = name
      AND uo.user_id = auth.uid()
  )
);

-- Org members can delete CVs
CREATE POLICY "Org members can delete application CVs"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'application-cvs'
  AND EXISTS (
    SELECT 1
    FROM professional_applications pa
    JOIN user_organizations uo ON uo.org_id = pa.org_id
    WHERE pa.cv_file_path = name
      AND uo.user_id = auth.uid()
  )
);