-- Storage bucket voor meeting attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'meeting-attachments',
  'meeting-attachments',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Tabel voor attachment metadata
CREATE TABLE public.meeting_minute_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_minute_id UUID NOT NULL REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes voor performance
CREATE INDEX idx_meeting_minute_attachments_meeting 
  ON public.meeting_minute_attachments(meeting_minute_id);
CREATE INDEX idx_meeting_minute_attachments_org 
  ON public.meeting_minute_attachments(org_id);

-- Enable RLS
ALTER TABLE public.meeting_minute_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Org members can view attachments"
ON public.meeting_minute_attachments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = meeting_minute_attachments.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can insert attachments"
ON public.meeting_minute_attachments FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = meeting_minute_attachments.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can delete attachments"
ON public.meeting_minute_attachments FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = meeting_minute_attachments.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

-- Storage Policies
CREATE POLICY "Authenticated users can upload meeting attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'meeting-attachments');

CREATE POLICY "Authenticated users can view meeting attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'meeting-attachments');

CREATE POLICY "Authenticated users can delete meeting attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'meeting-attachments');