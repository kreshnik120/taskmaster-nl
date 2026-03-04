-- =============================================
-- STAP 1A: Kolommen toevoegen aan professional_documents
-- =============================================
ALTER TABLE public.professional_documents
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS content_type TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'overig',
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT false;

-- =============================================
-- STAP 1B: bendy_document_id nullable maken
-- =============================================
ALTER TABLE public.professional_documents
  ALTER COLUMN bendy_document_id DROP NOT NULL;

-- =============================================
-- STAP 1C: UNIQUE constraint vervangen
-- =============================================
ALTER TABLE public.professional_documents
  DROP CONSTRAINT IF EXISTS professional_documents_professional_id_bendy_document_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prof_docs_bendy_id_unique
  ON public.professional_documents(professional_id, bendy_document_id)
  WHERE bendy_document_id IS NOT NULL;

-- =============================================
-- STAP 1D: Index op category
-- =============================================
CREATE INDEX IF NOT EXISTS idx_prof_docs_category
  ON public.professional_documents(category);

-- =============================================
-- STAP 1E: Storage bucket
-- =============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'professional-documents',
  'professional-documents',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
) ON CONFLICT (id) DO NOTHING;

-- =============================================
-- STAP 1F: Storage RLS policies
-- =============================================
CREATE POLICY "org_members_upload_professional_docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'professional-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT uo.org_id::text FROM public.user_organizations uo WHERE uo.user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_read_professional_docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'professional-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT uo.org_id::text FROM public.user_organizations uo WHERE uo.user_id = auth.uid()
    )
  );

-- =============================================
-- STAP 1G: Tabel RLS policies (INSERT + UPDATE)
-- =============================================
CREATE POLICY "org_members_insert_documents" ON public.professional_documents
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (
    SELECT uo.org_id FROM public.user_organizations uo WHERE uo.user_id = auth.uid()
  ));

CREATE POLICY "org_members_update_documents" ON public.professional_documents
  FOR UPDATE TO authenticated
  USING (org_id IN (
    SELECT uo.org_id FROM public.user_organizations uo WHERE uo.user_id = auth.uid()
  ))
  WITH CHECK (org_id IN (
    SELECT uo.org_id FROM public.user_organizations uo WHERE uo.user_id = auth.uid()
  ));