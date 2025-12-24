-- Add CV fields to professionals table
ALTER TABLE public.professionals
ADD COLUMN IF NOT EXISTS cv_file_path TEXT,
ADD COLUMN IF NOT EXISTS cv_file_name TEXT,
ADD COLUMN IF NOT EXISTS cv_uploaded_at TIMESTAMPTZ;

-- Sync existing CV data from linked applications
UPDATE public.professionals p
SET 
  cv_file_path = pa.cv_file_path,
  cv_file_name = pa.cv_file_name,
  cv_uploaded_at = COALESCE(pa.created_at, NOW())
FROM public.professional_applications pa
WHERE p.id = pa.professional_id
  AND p.cv_file_path IS NULL
  AND pa.cv_file_path IS NOT NULL;