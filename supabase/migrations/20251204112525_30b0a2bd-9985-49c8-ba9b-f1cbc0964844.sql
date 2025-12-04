-- Add missing NAW columns to professionals table
ALTER TABLE public.professionals 
ADD COLUMN IF NOT EXISTS adres TEXT,
ADD COLUMN IF NOT EXISTS geboortedatum DATE,
ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.professionals.geboortedatum IS 'Birth date extracted from CV or manually entered';
COMMENT ON COLUMN public.professionals.adres IS 'Street address from CV extraction';
COMMENT ON COLUMN public.professionals.profile_photo_url IS 'URL to profile photo in storage bucket';