-- Add logo_url column to clients table for storing client organization logos
ALTER TABLE clients ADD COLUMN logo_url TEXT;

-- Create storage bucket for client logos (public access for display)
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-logos', 'client-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for client-logos bucket
CREATE POLICY "Client logos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-logos');

CREATE POLICY "Admins can upload client logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'client-logos' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can update client logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'client-logos' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete client logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'client-logos' 
  AND has_role(auth.uid(), 'admin'::app_role)
);