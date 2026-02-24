

# Client Contacts Tabel voor OpenClaw AI-integratie

## Migratie: `client_contacts` tabel aanmaken

De SQL wordt uitgevoerd met een kleine aanpassing: de functie `update_updated_at()` bestaat al als `update_updated_at_column()` in de database. We hergebruiken die bestaande functie in plaats van een nieuwe aan te maken — dit voorkomt conflicten.

### SQL die wordt uitgevoerd:

```sql
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

-- Hergebruik bestaande functie update_updated_at_column()
CREATE TRIGGER client_contacts_updated_at
  BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

### Aanpassingen t.o.v. jouw originele SQL:
- `CREATE OR REPLACE FUNCTION update_updated_at()` is **verwijderd** — de functie `update_updated_at_column()` bestaat al in de database en wordt hergebruikt
- De trigger verwijst naar `update_updated_at_column()` in plaats van `update_updated_at()`

---

## Vraag 2: SUPABASE_SERVICE_ROLE_KEY

De Service Role Key is **niet beschikbaar** via Lovable. Dit is een beveiligingsmaatregel — de service_role key geeft volledige onbeperkte toegang tot de database (omzeilt alle RLS) en wordt daarom niet blootgesteld.

**Wat je kunt doen:**
1. Ga naar je Lovable project Settings (tandwiel icoon)
2. Klik op "Cloud" (of "Connectors" > "Lovable Cloud")
3. Klik op "Open in Supabase" — als deze optie beschikbaar is, kun je daar de key vinden onder Settings > API > service_role key

Als die optie niet beschikbaar is, is een alternatief om een **edge function** te maken die als proxy dient. De edge function draait met service_role rechten en kan de data veilig ophalen. Zo hoeft de VPS de service_role key niet direct te hebben — alleen een API key voor de edge function.

