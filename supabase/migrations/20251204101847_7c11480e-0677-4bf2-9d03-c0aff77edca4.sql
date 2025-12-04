-- Add profile_photo_url column to professional_applications
ALTER TABLE professional_applications 
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

-- Add profile_photo_url column to professionals
ALTER TABLE professionals 
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;