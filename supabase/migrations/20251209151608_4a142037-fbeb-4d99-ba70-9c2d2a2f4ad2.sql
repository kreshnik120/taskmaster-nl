-- Create application_documents table for tracking uploaded documents
CREATE TABLE public.application_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.professional_applications(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_type TEXT,
  document_type TEXT CHECK (document_type IN ('vog', 'diploma', 'certificate', 'cv', 'id', 'other')),
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id),
  vog_issue_date DATE,
  vog_expiry_status TEXT CHECK (vog_expiry_status IN ('valid', 'expiring_soon', 'expired', NULL)),
  created_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.application_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies for application_documents
CREATE POLICY "Users can view documents for their org applications"
ON public.application_documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.professional_applications pa
    JOIN public.user_organizations uo ON uo.org_id = pa.org_id
    WHERE pa.id = application_documents.application_id 
    AND uo.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all documents"
ON public.application_documents FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can manage documents"
ON public.application_documents FOR ALL
USING (public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'manager'));

-- Create index for faster lookups
CREATE INDEX idx_application_documents_application_id ON public.application_documents(application_id);
CREATE INDEX idx_application_documents_document_type ON public.application_documents(document_type);

-- Create storage bucket for application documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('application-documents', 'application-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for application-documents bucket
CREATE POLICY "Authenticated users can upload application documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'application-documents');

CREATE POLICY "Authenticated users can view application documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'application-documents');

CREATE POLICY "Authenticated users can update application documents"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'application-documents');

CREATE POLICY "Authenticated users can delete application documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'application-documents');