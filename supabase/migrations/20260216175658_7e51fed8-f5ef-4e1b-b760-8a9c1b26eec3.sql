
-- Nieuwe kolommen op professionals
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS voorletters TEXT;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS geboorteplaats TEXT;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS geslacht TEXT;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS bendy_external_id TEXT;

-- BSN tabel
CREATE TABLE IF NOT EXISTS public.professional_bsn (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  encrypted_bsn TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(professional_id)
);

ALTER TABLE public.professional_bsn ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_only_bsn_select" ON public.professional_bsn
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "service_role_bsn_all" ON public.professional_bsn
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_professional_bsn_prof_id ON public.professional_bsn(professional_id);

-- Extend existing security_audit_log with missing columns
ALTER TABLE public.security_audit_log ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE public.security_audit_log ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.security_audit_log ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE public.security_audit_log ADD COLUMN IF NOT EXISTS details JSONB;

CREATE INDEX IF NOT EXISTS idx_security_audit_log_entity ON public.security_audit_log(entity_type, entity_id);
