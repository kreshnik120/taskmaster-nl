-- Create storage bucket for profile photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to profile photos
CREATE POLICY "Profile photos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-photos');

-- Allow authenticated users to upload profile photos
CREATE POLICY "Authenticated users can upload profile photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'profile-photos' AND auth.role() = 'authenticated');

-- Allow service role to upload profile photos (for edge functions)
CREATE POLICY "Service role can upload profile photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'profile-photos');

-- Allow updates to profile photos
CREATE POLICY "Authenticated users can update profile photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'profile-photos')
WITH CHECK (bucket_id = 'profile-photos');

-- Allow deletion of profile photos
CREATE POLICY "Authenticated users can delete profile photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'profile-photos');