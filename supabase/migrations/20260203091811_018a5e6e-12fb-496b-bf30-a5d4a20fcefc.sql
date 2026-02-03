-- ============================================================================
-- M6 FACTURATIE MODULE - Complete Database Schema
-- ============================================================================

-- 1. TABELLEN
-- ============================================================================

-- 1.1 Hoofdtabel: factuur
CREATE TABLE public.factuur (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign Keys
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    opdrachtgever_id UUID REFERENCES public.client_organizations(id) ON DELETE RESTRICT,
    flexwerker_id UUID REFERENCES public.professionals(id) ON DELETE RESTRICT,
    
    -- Factuur identificatie
    factuur_nummer VARCHAR(30) UNIQUE,
    type VARCHAR(20) NOT NULL DEFAULT 'VERKOOP'
        CHECK (type IN ('VERKOOP', 'SELFBILLING', 'INKOOP', 'CREDIT')),
    
    -- Datums
    factuurdatum DATE NOT NULL DEFAULT CURRENT_DATE,
    vervaldatum DATE NOT NULL,
    
    -- Urenstaat referenties
    urenstaat_ids UUID[] NOT NULL DEFAULT '{}',
    
    -- Bedragen (EUR, 2 decimalen)
    subtotaal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    btw_percentage NUMERIC(4,2) NOT NULL DEFAULT 21.00
        CHECK (btw_percentage IN (0.00, 9.00, 21.00)),
    btw_bedrag NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    totaal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    betaald_bedrag NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    openstaand_bedrag NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    
    -- Status workflow
    status VARCHAR(20) NOT NULL DEFAULT 'CONCEPT'
        CHECK (status IN (
            'CONCEPT', 'DEFINITIEF', 'VERZONDEN',
            'HERINNERING_1', 'HERINNERING_2', 'HERINNERING_3',
            'BETWIST', 'BETAALD', 'AFGEBOEKT'
        )),
    
    -- Verzending tracking
    verzonden_op TIMESTAMPTZ,
    verzonden_naar VARCHAR(255),
    pdf_url VARCHAR(500),
    
    -- Optionele velden
    referentie VARCHAR(100),
    notities TEXT,
    betalingskenmerk VARCHAR(50),
    
    -- Metadata
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT chk_factuur_vervaldatum CHECK (vervaldatum >= factuurdatum)
);

-- 1.2 Factuurregels
CREATE TABLE public.factuur_regel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factuur_id UUID NOT NULL REFERENCES public.factuur(id) ON DELETE CASCADE,
    urenstaat_id UUID,
    
    omschrijving TEXT NOT NULL,
    aantal NUMERIC(10,2) NOT NULL DEFAULT 1,
    eenheid VARCHAR(20) DEFAULT 'uur',
    prijs NUMERIC(12,2) NOT NULL,
    btw_percentage NUMERIC(4,2) NOT NULL DEFAULT 21.00
        CHECK (btw_percentage IN (0.00, 9.00, 21.00)),
    
    -- Berekende velden (GENERATED)
    subtotaal NUMERIC(12,2) GENERATED ALWAYS AS (ROUND(aantal * prijs, 2)) STORED,
    btw_bedrag NUMERIC(12,2) GENERATED ALWAYS AS (ROUND(aantal * prijs * (btw_percentage / 100), 2)) STORED,
    totaal NUMERIC(12,2) GENERATED ALWAYS AS (ROUND(aantal * prijs * (1 + btw_percentage / 100), 2)) STORED,
    
    volgorde INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT chk_factuur_regel_aantal CHECK (aantal > 0),
    CONSTRAINT chk_factuur_regel_prijs CHECK (prijs >= 0)
);

-- 1.3 Betalingen
CREATE TABLE public.betaling (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factuur_id UUID NOT NULL REFERENCES public.factuur(id) ON DELETE RESTRICT,
    
    bedrag NUMERIC(12,2) NOT NULL,
    datum DATE NOT NULL DEFAULT CURRENT_DATE,
    methode VARCHAR(20) NOT NULL DEFAULT 'BANK'
        CHECK (methode IN ('BANK', 'IDEAL', 'INCASSO', 'CONTANT', 'OVERIG')),
    
    referentie VARCHAR(100),
    opmerking TEXT,
    
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT chk_betaling_bedrag CHECK (bedrag > 0)
);

-- 1.4 Herinneringen
CREATE TABLE public.factuur_herinnering (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factuur_id UUID NOT NULL REFERENCES public.factuur(id) ON DELETE CASCADE,
    
    niveau INTEGER NOT NULL CHECK (niveau IN (1, 2, 3)),
    verzonden_op TIMESTAMPTZ NOT NULL DEFAULT now(),
    verzonden_naar VARCHAR(255) NOT NULL,
    
    openstaand_bedrag NUMERIC(12,2) NOT NULL,
    email_log TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.5 Factuurnummer sequence
CREATE TABLE public.factuur_nummer_sequence (
    tenant_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    jaar INTEGER NOT NULL,
    laatste_nummer INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, jaar)
);

-- 2. INDEXEN
-- ============================================================================

CREATE INDEX idx_factuur_tenant_id ON public.factuur(tenant_id);
CREATE INDEX idx_factuur_opdrachtgever_id ON public.factuur(opdrachtgever_id);
CREATE INDEX idx_factuur_status ON public.factuur(status);
CREATE INDEX idx_factuur_factuurdatum ON public.factuur(factuurdatum);
CREATE INDEX idx_factuur_vervaldatum ON public.factuur(vervaldatum);
CREATE INDEX idx_factuur_tenant_status ON public.factuur(tenant_id, status);
CREATE INDEX idx_factuur_deleted_at ON public.factuur(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX idx_factuur_regel_factuur_id ON public.factuur_regel(factuur_id);
CREATE INDEX idx_factuur_regel_volgorde ON public.factuur_regel(factuur_id, volgorde);

CREATE INDEX idx_betaling_factuur_id ON public.betaling(factuur_id);
CREATE INDEX idx_betaling_datum ON public.betaling(datum);

CREATE INDEX idx_factuur_herinnering_factuur_id ON public.factuur_herinnering(factuur_id);
CREATE UNIQUE INDEX idx_factuur_herinnering_uniek ON public.factuur_herinnering(factuur_id, niveau);

-- 3. TRIGGERS
-- ============================================================================

-- 3.1 Auto-generatie Factuurnummer
CREATE OR REPLACE FUNCTION public.fn_generate_factuur_nummer()
RETURNS TRIGGER AS $$
DECLARE
    v_jaar INTEGER;
    v_volgnummer INTEGER;
    v_org_code VARCHAR(10);
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

    SELECT UPPER(LEFT(REGEXP_REPLACE(name, '[^a-zA-Z]', '', 'g'), 3))
    INTO v_org_code
    FROM public.organizations
    WHERE id = NEW.tenant_id;

    IF v_org_code IS NULL OR v_org_code = '' THEN
        v_org_code := 'FAC';
    END IF;

    NEW.factuur_nummer := v_org_code || '-' || v_jaar || '-' || LPAD(v_volgnummer::TEXT, 6, '0');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_factuur_nummer_generate
    BEFORE INSERT ON public.factuur
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_generate_factuur_nummer();

-- 3.2 Auto-update Factuur Bedragen bij Regel Wijziging
CREATE OR REPLACE FUNCTION public.fn_update_factuur_bedragen()
RETURNS TRIGGER AS $$
DECLARE
    v_factuur_id UUID;
    v_subtotaal NUMERIC(12,2);
    v_btw NUMERIC(12,2);
    v_totaal NUMERIC(12,2);
    v_betaald NUMERIC(12,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_factuur_id := OLD.factuur_id;
    ELSE
        v_factuur_id := NEW.factuur_id;
    END IF;

    SELECT
        COALESCE(SUM(subtotaal), 0),
        COALESCE(SUM(btw_bedrag), 0)
    INTO v_subtotaal, v_btw
    FROM public.factuur_regel
    WHERE factuur_id = v_factuur_id;

    v_totaal := v_subtotaal + v_btw;

    SELECT COALESCE(SUM(bedrag), 0)
    INTO v_betaald
    FROM public.betaling
    WHERE factuur_id = v_factuur_id;

    UPDATE public.factuur
    SET
        subtotaal = v_subtotaal,
        btw_bedrag = v_btw,
        totaal = v_totaal,
        openstaand_bedrag = v_totaal - v_betaald,
        updated_at = now()
    WHERE id = v_factuur_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_factuur_regel_bedragen
    AFTER INSERT OR UPDATE OR DELETE ON public.factuur_regel
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_update_factuur_bedragen();

-- 3.3 Auto-update Status bij Betaling
CREATE OR REPLACE FUNCTION public.fn_update_factuur_bij_betaling()
RETURNS TRIGGER AS $$
DECLARE
    v_factuur_id UUID;
    v_totaal NUMERIC(12,2);
    v_betaald NUMERIC(12,2);
    v_openstaand NUMERIC(12,2);
    v_nieuwe_status VARCHAR(20);
    v_huidige_status VARCHAR(20);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_factuur_id := OLD.factuur_id;
    ELSE
        v_factuur_id := NEW.factuur_id;
    END IF;

    SELECT totaal, status INTO v_totaal, v_huidige_status
    FROM public.factuur WHERE id = v_factuur_id;

    SELECT COALESCE(SUM(bedrag), 0) INTO v_betaald
    FROM public.betaling WHERE factuur_id = v_factuur_id;

    v_openstaand := v_totaal - v_betaald;

    v_nieuwe_status := v_huidige_status;
    IF v_huidige_status NOT IN ('CONCEPT', 'AFGEBOEKT') THEN
        IF v_openstaand <= 0 THEN
            v_nieuwe_status := 'BETAALD';
        END IF;
    END IF;

    UPDATE public.factuur
    SET
        betaald_bedrag = v_betaald,
        openstaand_bedrag = GREATEST(v_openstaand, 0),
        status = v_nieuwe_status,
        updated_at = now()
    WHERE id = v_factuur_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_betaling_update_factuur
    AFTER INSERT OR UPDATE OR DELETE ON public.betaling
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_update_factuur_bij_betaling();

-- 4. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.factuur ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factuur FORCE ROW LEVEL SECURITY;

ALTER TABLE public.factuur_regel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factuur_regel FORCE ROW LEVEL SECURITY;

ALTER TABLE public.betaling ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.betaling FORCE ROW LEVEL SECURITY;

ALTER TABLE public.factuur_herinnering ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factuur_herinnering FORCE ROW LEVEL SECURITY;

ALTER TABLE public.factuur_nummer_sequence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factuur_nummer_sequence FORCE ROW LEVEL SECURITY;

-- 4.1 Sequence Policies
CREATE POLICY "sequence_select" ON public.factuur_nummer_sequence FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.org_id = factuur_nummer_sequence.tenant_id
        AND uo.user_id = auth.uid()
    )
);

CREATE POLICY "sequence_insert" ON public.factuur_nummer_sequence FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.org_id = factuur_nummer_sequence.tenant_id
        AND uo.user_id = auth.uid()
    )
);

CREATE POLICY "sequence_update" ON public.factuur_nummer_sequence FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.org_id = factuur_nummer_sequence.tenant_id
        AND uo.user_id = auth.uid()
    )
);

-- 4.2 Factuur Policies
CREATE POLICY "factuur_select_org_members" ON public.factuur FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.org_id = factuur.tenant_id
        AND uo.user_id = auth.uid()
    )
);

CREATE POLICY "factuur_insert_org_members" ON public.factuur FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.org_id = factuur.tenant_id
        AND uo.user_id = auth.uid()
    )
    AND status = 'CONCEPT'
);

CREATE POLICY "factuur_update_org_members" ON public.factuur FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.org_id = factuur.tenant_id
        AND uo.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.org_id = factuur.tenant_id
        AND uo.user_id = auth.uid()
    )
);

CREATE POLICY "factuur_delete_concept_only" ON public.factuur FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.org_id = factuur.tenant_id
        AND uo.user_id = auth.uid()
    )
    AND status = 'CONCEPT'
);

-- 4.3 Factuur Regel Policies
CREATE POLICY "factuur_regel_select" ON public.factuur_regel FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.factuur f
        JOIN public.user_organizations uo ON uo.org_id = f.tenant_id
        WHERE f.id = factuur_regel.factuur_id
        AND uo.user_id = auth.uid()
    )
);

CREATE POLICY "factuur_regel_insert" ON public.factuur_regel FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.factuur f
        JOIN public.user_organizations uo ON uo.org_id = f.tenant_id
        WHERE f.id = factuur_regel.factuur_id
        AND uo.user_id = auth.uid()
        AND f.status = 'CONCEPT'
    )
);

CREATE POLICY "factuur_regel_update" ON public.factuur_regel FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.factuur f
        JOIN public.user_organizations uo ON uo.org_id = f.tenant_id
        WHERE f.id = factuur_regel.factuur_id
        AND uo.user_id = auth.uid()
        AND f.status = 'CONCEPT'
    )
);

CREATE POLICY "factuur_regel_delete" ON public.factuur_regel FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.factuur f
        JOIN public.user_organizations uo ON uo.org_id = f.tenant_id
        WHERE f.id = factuur_regel.factuur_id
        AND uo.user_id = auth.uid()
        AND f.status = 'CONCEPT'
    )
);

-- 4.4 Betaling Policies
CREATE POLICY "betaling_select" ON public.betaling FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.factuur f
        JOIN public.user_organizations uo ON uo.org_id = f.tenant_id
        WHERE f.id = betaling.factuur_id
        AND uo.user_id = auth.uid()
    )
);

CREATE POLICY "betaling_insert" ON public.betaling FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.factuur f
        JOIN public.user_organizations uo ON uo.org_id = f.tenant_id
        WHERE f.id = betaling.factuur_id
        AND uo.user_id = auth.uid()
        AND f.status NOT IN ('CONCEPT', 'AFGEBOEKT')
    )
);

CREATE POLICY "betaling_update" ON public.betaling FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.factuur f
        JOIN public.user_organizations uo ON uo.org_id = f.tenant_id
        WHERE f.id = betaling.factuur_id
        AND uo.user_id = auth.uid()
    )
);

CREATE POLICY "betaling_delete" ON public.betaling FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.factuur f
        JOIN public.user_organizations uo ON uo.org_id = f.tenant_id
        WHERE f.id = betaling.factuur_id
        AND uo.user_id = auth.uid()
    )
);

-- 4.5 Herinnering Policies
CREATE POLICY "herinnering_select" ON public.factuur_herinnering FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.factuur f
        JOIN public.user_organizations uo ON uo.org_id = f.tenant_id
        WHERE f.id = factuur_herinnering.factuur_id
        AND uo.user_id = auth.uid()
    )
);

CREATE POLICY "herinnering_insert" ON public.factuur_herinnering FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.factuur f
        JOIN public.user_organizations uo ON uo.org_id = f.tenant_id
        WHERE f.id = factuur_herinnering.factuur_id
        AND uo.user_id = auth.uid()
    )
);

-- 5. REALTIME
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.factuur;