

# BENDY-SYNC-4E: Document Sync + Collapsible Bugfix

## Overzicht
Twee wijzigingen: (1) bugfix voor het Bedrijfsgegevens collapsible blok, en (2) volledige document sync functionaliteit met nieuw database schema, edge function uitbreiding, en UI.

---

## Stap 0: Collapsible Bugfix

In `src/components/ProfessionalDetailModal.tsx` regel 929: wijzig `<Collapsible open={false}>` naar `<Collapsible defaultOpen={false}>`. Dit voorkomt dat het blok geforceerd dicht blijft en stelt gebruikers in staat het te openen.

---

## Stap 1: SQL Migratie

Nieuwe tabel `professional_documents` met kolommen:
- `id`, `professional_id` (FK naar professionals), `org_id`, `bendy_document_id`, `document_name`, `document_type`, `document_number`, `issuer`, `source`, `start_date`, `expires_at`, `status`, `published`, `bendy_created_at`, `bendy_updated_at`, `created_at`, `updated_at`, `last_synced_at`
- UNIQUE constraint op `(professional_id, bendy_document_id)`

RLS policies:
- SELECT voor authenticated users via `user_organizations` org_id check
- ALL voor service_role

Indexes op: `professional_id`, `org_id`, `expires_at` (partial), `bendy_document_id`, `status`

3 nieuwe kolommen op `professionals`:
- `documents_synced_at TIMESTAMPTZ`
- `documents_count INTEGER DEFAULT 0`
- `documents_expiring_count INTEGER DEFAULT 0`

---

## Stap 2: Edge Function (`supabase/functions/bendy-sync/index.ts`)

### 2a: Nieuwe `syncDocuments()` functie
Invoegen na `syncUsers()` (regel 1022) en voor `analyzeFieldFillRates()` (regel 1024).

Logica:
1. Alle professionals met `bendy_id` ophalen
2. Per professional: `GET /api/v2/users/{bendy_id}/documents` via `fetchBendyApi`
3. Per document: cache in `bendy_raw_cache` (entity_type='documents') + upsert in `professional_documents`
4. Expiring count berekenen (binnen 90 dagen)
5. Professional bijwerken met `documents_synced_at`, `documents_count`, `documents_expiring_count`

### 2b: Actie handler uitbreiden (regel 1544, 1582, 1590-1592)
- Voeg `sync_documents` toe aan de actie validatie
- Entity type mapping: `sync_documents` -> `'documents'`
- Dispatch: `sync_documents` -> `syncDocuments()`

---

## Stap 3: UI -- Document Sync knop (`src/pages/BendySync.tsx`)

Na het Professional Sync Card blok (na regel 655), een nieuw Card toevoegen:
- "Document Sync" titel met FileText icoon
- Knop "Document Sync Starten" die `sync_documents` actie aanroept
- Resultaat grid (opgehaald/aangemaakt/bijgewerkt/overgeslagen/mislukt)
- Eigen state variabelen: `syncingDocs`, `docSyncResult`

---

## Stap 4: UI -- Documenten sectie in ProfessionalDetailModal

### 4a: Interface uitbreiden
Toevoegen aan Professional interface (beide bestanden):
- `documents_count: number | null`
- `documents_expiring_count: number | null`
- `documents_synced_at: string | null`

### 4b: State + data fetching
Nieuwe state `documents` en useEffect die `professional_documents` ophaalt bij openen modal, gesorteerd op `expires_at ASC`.

### 4c: Nieuw Collapsible blok
Na het "Bedrijfsgegevens (Bendy)" blok, een oranje-gestyled collapsible:
- FileText icoon, oranje border/background
- Header toont totaal aantal documenten + badges voor verlopen/bijna-verlopen
- Per document: naam, type, verloopdatum
- Rode achtergrond + waarschuwingssymbool als verlopen
- Oranje achtergrond als binnen 90 dagen verloopt
- Badge "Verlopen" (destructive) en "Verloopt binnenkort" (warning)

---

## Bestanden die wijzigen

1. `src/components/ProfessionalDetailModal.tsx` -- collapsible bugfix + interface + documenten blok
2. `src/pages/Professionals.tsx` -- interface uitbreiden
3. `src/pages/BendySync.tsx` -- Document Sync knop
4. `supabase/functions/bendy-sync/index.ts` -- syncDocuments() + handler
5. SQL migratie (nieuw bestand)

## Technische details

```text
Document sync flow:
  1. GET professionals WHERE bendy_id IS NOT NULL
  2. Per professional: fetchBendyApi(tenant, '/api/v2/users/{bendy_id}/documents')
  3. Per document: upsert professional_documents ON (professional_id, bendy_document_id)
  4. Cache raw data in bendy_raw_cache (entity_type='documents')
  5. Update professionals SET documents_count, documents_expiring_count, documents_synced_at

RLS policy pattern (consistent met bestaand):
  org_id IN (SELECT uo.org_id FROM user_organizations uo WHERE uo.user_id = auth.uid())
```
