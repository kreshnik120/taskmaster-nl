-- ===================================================================
-- HIËRARCHISCHE KLANTSTRUCTUUR
-- Laag 1: Organisaties (KVK, BTW, etc.)
-- Laag 2: Hoofdlocaties (administratieve hoofdlocaties)
-- Laag 3: Sublocaties (werklocaties met kostenplaats)
-- Laag 4: Uursoorten + WTT regels (tarieven per sublocatie)
-- ===================================================================

-- LAAG 1: CLIENT ORGANIZATIONS (Moederorganisaties)
CREATE TABLE IF NOT EXISTS public.client_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) NOT NULL,
  name TEXT NOT NULL,
  kvk_nummer TEXT,
  btw_nummer TEXT,
  website TEXT,
  centrale_facturatie_email TEXT,
  logo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LAAG 2: CLIENT LOCATIONS (Hoofdlocaties)
CREATE TABLE IF NOT EXISTS public.client_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_org_id UUID REFERENCES public.client_organizations(id) ON DELETE CASCADE NOT NULL,
  naam TEXT NOT NULL,
  adres TEXT,
  postcode TEXT,
  plaats TEXT,
  provincie TEXT,
  factuur_email TEXT,
  contactpersoon_naam TEXT,
  contactpersoon_email TEXT,
  telefoon TEXT,
  ubl_enabled BOOLEAN NOT NULL DEFAULT false,
  crediteuren_tav TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LAAG 3: CLIENT SUBLOCATIONS (Werklocaties met kostenplaats)
CREATE TABLE IF NOT EXISTS public.client_sublocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES public.client_locations(id) ON DELETE CASCADE NOT NULL,
  naam TEXT NOT NULL,
  kostenplaats TEXT,
  relatienummer TEXT,
  adres TEXT,
  postcode TEXT,
  plaats TEXT,
  provincie TEXT,
  telefoon TEXT,
  gekoppelde_bv_org_id UUID REFERENCES public.organizations(id),
  factuur_via_hoofdlocatie BOOLEAN NOT NULL DEFAULT true,
  doelgroep TEXT[],
  doelgroep_omschrijving TEXT,
  publieke_opmerking TEXT,
  capaciteit_min INT,
  capaciteit_max INT,
  leeftijd_van INT,
  leeftijd_tot INT,
  sector TEXT[],
  gezochte_functies TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LAAG 4A: HOURLY RATES (Uursoorten per sublocatie)
CREATE TABLE IF NOT EXISTS public.hourly_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sublocation_id UUID REFERENCES public.client_sublocations(id) ON DELETE CASCADE NOT NULL,
  uursoort_naam TEXT NOT NULL,
  basis_tarief NUMERIC(10,2) NOT NULL,
  btw_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  kostensoort TEXT NOT NULL DEFAULT 'Bestede tijd',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LAAG 4B: WTT RULES (Werktijdentoeslagen per uursoort)
CREATE TABLE IF NOT EXISTS public.wtt_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hourly_rate_id UUID REFERENCES public.hourly_rates(id) ON DELETE CASCADE NOT NULL,
  dagtype TEXT NOT NULL,
  tijd_van TIME NOT NULL,
  tijd_tot TIME NOT NULL,
  wtt_percentage NUMERIC(5,2) NOT NULL,
  flex_tarief NUMERIC(10,2),
  marge_percentage NUMERIC(5,2),
  marge_bedrag NUMERIC(10,2),
  tarief_klant NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================================================================
-- TRIGGERS: Updated_at timestamps
-- ===================================================================

CREATE TRIGGER update_client_organizations_updated_at
  BEFORE UPDATE ON public.client_organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_locations_updated_at
  BEFORE UPDATE ON public.client_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_sublocations_updated_at
  BEFORE UPDATE ON public.client_sublocations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===================================================================
-- RLS POLICIES: Org-based access control
-- ===================================================================

-- Enable RLS
ALTER TABLE public.client_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_sublocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hourly_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wtt_rules ENABLE ROW LEVEL SECURITY;

-- CLIENT ORGANIZATIONS POLICIES
CREATE POLICY "Org members can view their client organizations"
  ON public.client_organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = client_organizations.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and managers can manage client organizations"
  ON public.client_organizations FOR ALL
  USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.user_organizations
      WHERE user_organizations.org_id = client_organizations.org_id
        AND user_organizations.user_id = auth.uid()
    )
  );

-- CLIENT LOCATIONS POLICIES
CREATE POLICY "Org members can view client locations"
  ON public.client_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_organizations co
      JOIN public.user_organizations uo ON uo.org_id = co.org_id
      WHERE co.id = client_locations.client_org_id
        AND uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and managers can manage client locations"
  ON public.client_locations FOR ALL
  USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.client_organizations co
      JOIN public.user_organizations uo ON uo.org_id = co.org_id
      WHERE co.id = client_locations.client_org_id
        AND uo.user_id = auth.uid()
    )
  );

-- CLIENT SUBLOCATIONS POLICIES
CREATE POLICY "Org members can view client sublocations"
  ON public.client_sublocations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_locations cl
      JOIN public.client_organizations co ON co.id = cl.client_org_id
      JOIN public.user_organizations uo ON uo.org_id = co.org_id
      WHERE cl.id = client_sublocations.location_id
        AND uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and managers can manage client sublocations"
  ON public.client_sublocations FOR ALL
  USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.client_locations cl
      JOIN public.client_organizations co ON co.id = cl.client_org_id
      JOIN public.user_organizations uo ON uo.org_id = co.org_id
      WHERE cl.id = client_sublocations.location_id
        AND uo.user_id = auth.uid()
    )
  );

-- HOURLY RATES POLICIES
CREATE POLICY "Org members can view hourly rates"
  ON public.hourly_rates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_sublocations cs
      JOIN public.client_locations cl ON cl.id = cs.location_id
      JOIN public.client_organizations co ON co.id = cl.client_org_id
      JOIN public.user_organizations uo ON uo.org_id = co.org_id
      WHERE cs.id = hourly_rates.sublocation_id
        AND uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and managers can manage hourly rates"
  ON public.hourly_rates FOR ALL
  USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.client_sublocations cs
      JOIN public.client_locations cl ON cl.id = cs.location_id
      JOIN public.client_organizations co ON co.id = cl.client_org_id
      JOIN public.user_organizations uo ON uo.org_id = co.org_id
      WHERE cs.id = hourly_rates.sublocation_id
        AND uo.user_id = auth.uid()
    )
  );

-- WTT RULES POLICIES
CREATE POLICY "Org members can view wtt rules"
  ON public.wtt_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.hourly_rates hr
      JOIN public.client_sublocations cs ON cs.id = hr.sublocation_id
      JOIN public.client_locations cl ON cl.id = cs.location_id
      JOIN public.client_organizations co ON co.id = cl.client_org_id
      JOIN public.user_organizations uo ON uo.org_id = co.org_id
      WHERE hr.id = wtt_rules.hourly_rate_id
        AND uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and managers can manage wtt rules"
  ON public.wtt_rules FOR ALL
  USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.hourly_rates hr
      JOIN public.client_sublocations cs ON cs.id = hr.sublocation_id
      JOIN public.client_locations cl ON cl.id = cs.location_id
      JOIN public.client_organizations co ON co.id = cl.client_org_id
      JOIN public.user_organizations uo ON uo.org_id = co.org_id
      WHERE hr.id = wtt_rules.hourly_rate_id
        AND uo.user_id = auth.uid()
    )
  );

-- ===================================================================
-- INDICES voor performance
-- ===================================================================

CREATE INDEX idx_client_organizations_org_id ON public.client_organizations(org_id);
CREATE INDEX idx_client_locations_client_org_id ON public.client_locations(client_org_id);
CREATE INDEX idx_client_sublocations_location_id ON public.client_sublocations(location_id);
CREATE INDEX idx_hourly_rates_sublocation_id ON public.hourly_rates(sublocation_id);
CREATE INDEX idx_wtt_rules_hourly_rate_id ON public.wtt_rules(hourly_rate_id);