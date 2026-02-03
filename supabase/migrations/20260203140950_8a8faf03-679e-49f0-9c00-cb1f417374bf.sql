-- ============================================================================
-- FACTURATIE INSTELLINGEN TABEL
-- ============================================================================

CREATE TABLE public.facturatie_instellingen (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- BTW Configuratie
    standaard_btw_percentage NUMERIC(4,2) NOT NULL DEFAULT 21.00
        CHECK (standaard_btw_percentage IN (0.00, 9.00, 21.00)),
    btw_vrijgesteld BOOLEAN NOT NULL DEFAULT false,
    btw_nummer VARCHAR(20),

    -- Betalingstermijn
    standaard_betalingstermijn INTEGER NOT NULL DEFAULT 30
        CHECK (standaard_betalingstermijn BETWEEN 1 AND 90),

    -- Factuurnummer configuratie
    factuur_prefix VARCHAR(10) NOT NULL DEFAULT 'FAC',
    factuur_volgnummer_lengte INTEGER NOT NULL DEFAULT 6
        CHECK (factuur_volgnummer_lengte BETWEEN 4 AND 10),

    -- Herinnering schema
    herinnering_dagen_1 INTEGER NOT NULL DEFAULT 14
        CHECK (herinnering_dagen_1 BETWEEN 1 AND 60),
    herinnering_dagen_2 INTEGER NOT NULL DEFAULT 28
        CHECK (herinnering_dagen_2 BETWEEN 1 AND 90),
    herinnering_dagen_3 INTEGER NOT NULL DEFAULT 42
        CHECK (herinnering_dagen_3 BETWEEN 1 AND 120),

    -- Bedrijfsgegevens
    bedrijfsnaam VARCHAR(255),
    adres_straat VARCHAR(255),
    adres_postcode VARCHAR(10),
    adres_plaats VARCHAR(100),
    adres_land VARCHAR(100) DEFAULT 'Nederland',
    kvk_nummer VARCHAR(20),
    iban VARCHAR(34),
    bic VARCHAR(11),
    logo_url VARCHAR(500),

    -- Factuur teksten
    factuur_footer_tekst TEXT,
    betalingsinstructies TEXT DEFAULT 'Gelieve het factuurnummer te vermelden bij uw betaling.',

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT chk_herinnering_volgorde CHECK (
        herinnering_dagen_1 < herinnering_dagen_2
        AND herinnering_dagen_2 < herinnering_dagen_3
    ),
    CONSTRAINT uq_tenant_instellingen UNIQUE (tenant_id)
);

-- Performance Index
CREATE INDEX idx_facturatie_instellingen_tenant ON public.facturatie_instellingen(tenant_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.facturatie_instellingen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facturatie_instellingen FORCE ROW LEVEL SECURITY;

CREATE POLICY "instellingen_select" ON public.facturatie_instellingen FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.org_id = facturatie_instellingen.tenant_id
    AND uo.user_id = auth.uid()
));

CREATE POLICY "instellingen_insert" ON public.facturatie_instellingen FOR INSERT
WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.org_id = facturatie_instellingen.tenant_id
    AND uo.user_id = auth.uid()
));

CREATE POLICY "instellingen_update" ON public.facturatie_instellingen FOR UPDATE
USING (EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.org_id = facturatie_instellingen.tenant_id
    AND uo.user_id = auth.uid()
));

-- ============================================================================
-- UPDATE TRIGGER VOOR FACTUURNUMMER GENERATIE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_generate_factuur_nummer()
RETURNS TRIGGER AS $$
DECLARE
    v_jaar INTEGER;
    v_volgnummer INTEGER;
    v_prefix VARCHAR(10);
    v_lengte INTEGER;
BEGIN
    IF NEW.factuur_nummer IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_jaar := EXTRACT(YEAR FROM NEW.factuurdatum);

    PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text || v_jaar::text));

    INSERT INTO public.factuur_nummer_sequence (tenant_id, jaar, laatste_nummer)
    VALUES (NEW.tenant_id, v_jaar, 1)
    ON CONFLICT (tenant_id, jaar)
    DO UPDATE SET laatste_nummer = public.factuur_nummer_sequence.laatste_nummer + 1
    RETURNING laatste_nummer INTO v_volgnummer;

    SELECT
        COALESCE(fi.factuur_prefix, UPPER(LEFT(REGEXP_REPLACE(o.name, '[^a-zA-Z]', '', 'g'), 3))),
        COALESCE(fi.factuur_volgnummer_lengte, 6)
    INTO v_prefix, v_lengte
    FROM public.organizations o
    LEFT JOIN public.facturatie_instellingen fi ON fi.tenant_id = o.id
    WHERE o.id = NEW.tenant_id;

    IF v_prefix IS NULL OR v_prefix = '' THEN
        v_prefix := 'FAC';
    END IF;

    IF v_lengte IS NULL THEN
        v_lengte := 6;
    END IF;

    NEW.factuur_nummer := v_prefix || '-' || v_jaar || '-' || LPAD(v_volgnummer::TEXT, v_lengte, '0');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;