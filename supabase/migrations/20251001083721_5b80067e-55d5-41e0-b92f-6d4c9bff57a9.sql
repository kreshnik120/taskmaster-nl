-- Create storage bucket for training documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-documents',
  'training-documents',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown']
);

-- Enable RLS on storage.objects for training-documents bucket
CREATE POLICY "Users can upload training documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'training-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their training documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'training-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their training documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'training-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Create table for document metadata
CREATE TABLE IF NOT EXISTS public.training_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing', -- processing, completed, failed
  extracted_knowledge_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT valid_status CHECK (status IN ('processing', 'completed', 'failed'))
);

-- Enable RLS
ALTER TABLE public.training_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for training_documents
CREATE POLICY "Users can view their org training documents"
ON public.training_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = training_documents.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create training documents"
ON public.training_documents
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = training_documents.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their training documents"
ON public.training_documents
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = training_documents.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their training documents"
ON public.training_documents
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = training_documents.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

-- Create index for performance
CREATE INDEX idx_training_documents_org_id ON public.training_documents(org_id);
CREATE INDEX idx_training_documents_user_id ON public.training_documents(user_id);
CREATE INDEX idx_training_documents_status ON public.training_documents(status);