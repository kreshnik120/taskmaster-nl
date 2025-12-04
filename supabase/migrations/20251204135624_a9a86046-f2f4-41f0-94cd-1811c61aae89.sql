-- Create storage bucket for organization logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'organization-logos',
  'organization-logos', 
  true,
  2097152, -- 2MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to logos
CREATE POLICY "Organization logos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'organization-logos');

-- Allow authenticated users to upload logos
CREATE POLICY "Authenticated users can upload organization logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'organization-logos' AND auth.role() = 'authenticated');

-- Allow authenticated users to update logos
CREATE POLICY "Authenticated users can update organization logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'organization-logos' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete logos
CREATE POLICY "Authenticated users can delete organization logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'organization-logos' AND auth.role() = 'authenticated');