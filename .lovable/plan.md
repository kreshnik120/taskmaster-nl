
# BENDY-SYNC-4D: Company Data + Ontbrekende User Velden

## Overzicht
Drie typen wijzigingen: (1) SQL migratie voor 9 nieuwe kolommen, (2) edge function aanpassen voor company data via `included` array, en (3) UI uitbreiden met "Bedrijfsgegevens (Bendy)" collapsible.

---

## Deel 1: SQL Migratie -- 9 nieuwe kolommen

Toevoegen aan `professionals` tabel:
- `agb_code TEXT`
- `skj_registratie TEXT`
- `iban_tenaamstelling TEXT`
- `boekhouding_email TEXT`
- `bedrijfstelefoon TEXT`
- `bendy_username TEXT`
- `bendy_mediator_id TEXT`
- `bendy_function_type TEXT`
- `bendy_created_at TIMESTAMPTZ`

Bestaande kolommen (`bedrijfsnaam`, `kvk_nummer`, `btw_nummer`, `iban`, `big_nummer`) worden NIET aangeraakt.

---

## Deel 2: Edge Function (`supabase/functions/bendy-sync/index.ts`)

### 2a: `fetchAllBendyRecords` return type wijzigen
Huidige functie retourneert `Promise<any[]>`. Wijzigen naar `Promise<{ records: any[]; included: any[] }>` zodat de `included` array (met company objecten) wordt meegegeven.

### 2b: Alle 3 aanroepen updaten
1. `syncClients` (regel 338): `const { records: bendyClients } = await fetchAllBendyRecords(...)`
2. `syncUsers` users (regel 744): `const { records: bendyUsers, included: bendyIncluded } = await fetchAllBendyRecords(tenant, '/api/v2/users', { include: 'groups,company' })`
3. `syncUsers` groups (regel 758): `const { records: bendyGroups } = await fetchAllBendyRecords(...)`

### 2c: Company map bouwen (na groupMap, rond regel 763)
Bouw een `Map<string, any>` van company ID naar attributes uit de `bendyIncluded` array, gefilterd op `type === 'companies'`.

### 2d: SELECT uitbreiden (regel 752)
De select query voor professionals uitbreiden met: `bedrijfsnaam, kvk_nummer, btw_nummer, iban, big_nummer, agb_code, skj_registratie, iban_tenaamstelling, boekhouding_email, bedrijfstelefoon, bendy_username, bendy_mediator_id, bendy_function_type, bendy_created_at`

### 2e: UPDATE pad uitbreiden (na regel 822, na certificaten blok)
Company data conditioneel syncen (10 velden: bedrijfsnaam, kvk_nummer, btw_nummer, iban, big_nummer, agb_code, skj_registratie, iban_tenaamstelling, boekhouding_email, bedrijfstelefoon) via `bendyUser.relationships.company.data.id` -> `companyMap` lookup.
Extra user attrs (4 velden: bendy_username, bendy_mediator_id, bendy_function_type, bendy_created_at).

### 2f: INSERT pad uitbreiden (na regel 908)
Dezelfde 4 extra user attrs toevoegen aan insertData. Company data toevoegen via companyMap lookup voor het insertData object.

---

## Deel 3: UI Wijzigingen

### 3a: Interfaces uitbreiden
Beide interfaces (in `ProfessionalDetailModal.tsx` en `Professionals.tsx`) uitbreiden met 11 nieuwe velden:
`iban, big_nummer, agb_code, skj_registratie, iban_tenaamstelling, boekhouding_email, bedrijfstelefoon, bendy_username, bendy_mediator_id, bendy_function_type, bendy_created_at`

### 3b: Nieuw "Bedrijfsgegevens (Bendy)" Collapsible blok
Na de bestaande "Financieel" sectie (regel 912), een nieuw collapsible blok toevoegen met `collapsible-glass-teal` styling en `Link2` icoon. Toont: bedrijfsnaam, KvK, BIG, AGB, SKJ, BTW (allen font-mono), IBAN (col-span-2, font-mono) met tenaamstelling, boekhouding_email, bedrijfstelefoon. Alleen zichtbaar als minstens 1 veld gevuld is.

---

## Bestanden die wijzigen
1. SQL migratie (nieuw bestand)
2. `supabase/functions/bendy-sync/index.ts` -- fetchAllBendyRecords refactor + company sync
3. `src/components/ProfessionalDetailModal.tsx` -- interface + nieuw collapsible blok
4. `src/pages/Professionals.tsx` -- interface uitbreiden
