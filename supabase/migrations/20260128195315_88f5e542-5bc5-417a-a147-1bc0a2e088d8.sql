-- Create whatsapp_media table for storing media metadata
CREATE TABLE public.whatsapp_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES whatsapp_messages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'whatsapp-media',
  storage_path TEXT NOT NULL,
  storage_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX idx_whatsapp_media_message_id ON public.whatsapp_media(message_id);
CREATE INDEX idx_whatsapp_media_org_id ON public.whatsapp_media(org_id);

-- Enable RLS
ALTER TABLE public.whatsapp_media ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Org members can view media" ON public.whatsapp_media
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role can insert media" ON public.whatsapp_media
  FOR INSERT WITH CHECK (true);

-- Create whatsapp-media storage bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  false,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'audio/ogg', 'audio/mpeg', 'application/pdf']
);

-- Storage RLS policies
CREATE POLICY "Org members can view media files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'whatsapp-media' AND
    (storage.foldername(name))[1] IN (
      SELECT o.id::text FROM organizations o
      JOIN user_organizations uo ON uo.org_id = o.id
      WHERE uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can upload media files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'whatsapp-media');