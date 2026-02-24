CREATE TABLE public.client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.client_organizations(id) ON DELETE CASCADE,
  naam TEXT NOT NULL,
  functie TEXT,
  telefoon TEXT,
  email TEXT,
  is_primary BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'actief' CHECK (status IN ('actief', 'inactief')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_client_contacts_telefoon ON public.client_contacts(telefoon);
CREATE INDEX idx_client_contacts_org_id ON public.client_contacts(organization_id);

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.client_contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_no_access" ON public.client_contacts
  FOR ALL TO anon, authenticated USING (false);

CREATE TRIGGER client_contacts_updated_at
  BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();