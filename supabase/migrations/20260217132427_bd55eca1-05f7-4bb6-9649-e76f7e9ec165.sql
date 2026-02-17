
-- professional_documents tabel
CREATE TABLE IF NOT EXISTS public.professional_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  bendy_document_id TEXT NOT NULL,
  document_name TEXT NOT NULL,
  document_type TEXT,
  document_number TEXT,
  issuer TEXT,
  source TEXT,
  start_date DATE,
  expires_at DATE,
  status TEXT DEFAULT 'active',
  published BOOLEAN DEFAULT false,
  bendy_created_at TIMESTAMPTZ,
  bendy_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(professional_id, bendy_document_id)
);

ALTER TABLE public.professional_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_documents" ON public.professional_documents
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT uo.org_id FROM public.user_organizations uo WHERE uo.user_id = auth.uid()));

CREATE POLICY "service_role_documents_all" ON public.professional_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_prof_docs_professional ON public.professional_documents(professional_id);
CREATE INDEX IF NOT EXISTS idx_prof_docs_org ON public.professional_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_prof_docs_expires ON public.professional_documents(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prof_docs_bendy_id ON public.professional_documents(bendy_document_id);
CREATE INDEX IF NOT EXISTS idx_prof_docs_status ON public.professional_documents(status);

-- 3 stats kolommen op professionals
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS documents_synced_at TIMESTAMPTZ;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS documents_count INTEGER DEFAULT 0;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS documents_expiring_count INTEGER DEFAULT 0;
