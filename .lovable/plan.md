

# M6 Facturatie - DEEL 1: Implementatie Plan

## Overzicht

Dit plan implementeert de volledige foundation voor de Facturatie Instellingen module:

1. Database migratie met tabel, RLS, CHECK constraints, index en trigger update
2. TypeScript types voor instellingen en export
3. React hooks voor data management en export
4. Instellingen pagina met volledige configuratie UI
5. Route configuratie in App.tsx

---

## Fase 1: Database Migratie

### SQL Script

```sql
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

CREATE INDEX idx_facturatie_instellingen_tenant ON public.facturatie_instellingen(tenant_id);

-- RLS Policies
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

-- Trigger Update (met correcte $$ delimiters)
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
```

---

## Fase 2: TypeScript Types

**Bestand:** `src/types/facturatie.ts`

Toevoegen aan het einde:
- `FacturatieInstellingen` interface (22 velden)
- `UpdateFacturatieInstellingenInput` interface (alle velden optioneel)
- `FactuurExportRow` interface (12 velden voor export)
- `ExportFormat` type (`'csv' | 'xlsx'`)

---

## Fase 3: React Hooks

### 3.1 Nieuw: `src/hooks/facturatie/useFacturatieInstellingen.ts`

| Hook | Functie |
|------|---------|
| `useFacturatieInstellingen()` | Query voor tenant instellingen |
| `useUpdateFacturatieInstellingen()` | Upsert mutation met toast feedback |

### 3.2 Nieuw: `src/hooks/facturatie/useFactuurExport.ts`

| Functie | Beschrijving |
|---------|--------------|
| `exportFacturen(format, filters?, selectedIds?)` | Export naar CSV of XLSX |
| CSV | BOM header, Nederlandse decimalen, puntkomma separator |
| XLSX | Dynamic import, kolom breedtes |

### 3.3 Update: `src/hooks/facturatie/index.ts`

Nieuwe exports toevoegen.

---

## Fase 4: Instellingen Pagina

**Nieuw:** `src/pages/FacturatieInstellingen.tsx`

### Layout

```text
+------------------------------------------------------------------+
| <- Terug   Facturatie Instellingen                    [Opslaan]  |
+------------------------------------------------------------------+
| BTW Configuratie                                                 |
| [21%/9%/0%] [BTW-nummer] [BTW-vrijgesteld toggle]               |
+------------------------------------------------------------------+
| Factuurnummer Configuratie                                       |
| Prefix: [FAC]  Lengte: [6]  Voorbeeld: FAC-2026-000001          |
+------------------------------------------------------------------+
| Betalingstermijn: [30] dagen                                     |
+------------------------------------------------------------------+
| Herinnering Schema                                               |
| (1) [14] dagen  (2) [28] dagen  (3) [42] dagen                  |
+------------------------------------------------------------------+
| Bedrijfsgegevens                                                 |
| Naam, Adres, KvK, IBAN, BIC                                      |
+------------------------------------------------------------------+
| Factuur Teksten                                                  |
| Betalingsinstructies, Footer                                     |
+------------------------------------------------------------------+
```

### Features
- Auto-load bestaande instellingen
- Live factuurnummer preview
- Change tracking voor save button
- Upsert logica (insert/update)
- Success feedback met checkmark
- Mobile responsive

---

## Fase 5: Route Configuratie

**Bestand:** `src/App.tsx`

Route toevoegen VOOR de `:id` route:

```typescript
<Route path="/facturatie/instellingen" element={<FacturatieInstellingen />} />
```

---

## Bestanden Overzicht

| Bestand | Actie |
|---------|-------|
| Database migratie | CREATE |
| `src/types/facturatie.ts` | EDIT (+55 regels) |
| `src/hooks/facturatie/useFacturatieInstellingen.ts` | CREATE |
| `src/hooks/facturatie/useFactuurExport.ts` | CREATE |
| `src/hooks/facturatie/index.ts` | EDIT |
| `src/pages/FacturatieInstellingen.tsx` | CREATE |
| `src/App.tsx` | EDIT |

---

## Verificatie Checklist

| Check | Item |
|-------|------|
| [ ] | Database tabel met CHECK constraints |
| [ ] | Index aangemaakt |
| [ ] | RLS policies werken |
| [ ] | Trigger met $$ delimiters |
| [ ] | TypeScript types toegevoegd |
| [ ] | Hooks werken |
| [ ] | Pagina laadt en slaat op |
| [ ] | Route werkt |
| [ ] | Geen TypeScript errors |

