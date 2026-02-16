

# BENDY-FIX-11: Volledige Professional Data Sync + Groepen Fix + BSN

## Overzicht
Dit is een grote wijziging met 4 delen: (1) SQL migratie voor nieuwe kolommen + BSN tabel, (2) fix voor groepen lookup via `include=groups`, (3) uitbreiding syncUsers met alle velden, en (4) UI uitbreiding voor de nieuwe data.

---

## Deel 1: SQL Migratie

Nieuwe kolommen op `professionals` tabel (4 kolommen ontbreken):
- `voorletters TEXT`
- `geboorteplaats TEXT`
- `geslacht TEXT`
- `bendy_external_id TEXT`

Nieuwe tabellen:
- `professional_bsn` -- encrypted BSN opslag met RLS (alleen admin + service_role)
- `security_audit_log` -- audit trail voor BSN-toegang

Inclusief indexes op `professional_bsn(professional_id)` en `security_audit_log(entity_type, entity_id)`.

---

## Deel 2: Fix Groepen Lookup (functie_niveau)

**Probleem**: `fetchAllBendyRecords(tenant, '/api/v2/users')` haalt users op ZONDER groepen. Bendy's JSON:API retourneert geen `relationships.groups.data` tenzij `include=groups` wordt meegegeven. Daardoor krijgt iedereen de fallback `'Helpende'`.

**Fix**: De `fetchBendyApi` functie bouwt URLs als `baseUrl + endpoint + ?params`. Als het endpoint al een `?` bevat (bijv. `/api/v2/users?include=groups`), ontstaat een dubbele `?`. Daarom wordt de `fetchAllBendyRecords` functie aangepast om een optionele `extraParams` parameter te accepteren, zodat `include=groups` als losse parameter wordt meegegeven in plaats van in het endpoint pad.

Wijzigingen:
- `fetchAllBendyRecords` krijgt optionele `extraParams: Record<string, string>` parameter
- Aanroep wordt: `fetchAllBendyRecords(tenant, '/api/v2/users', { include: 'groups' })`
- Paginatie-parameters worden gemerged met extraParams

---

## Deel 3: syncUsers() Uitbreiding

### 3a: Nieuwe helper `parseCertificates`
Parsed Bendy `certificates` array naar `string[]`.

### 3b: INSERT pad uitbreiden (nieuwe professionals)
Huidige 10 velden worden uitgebreid naar 15:
- Bestaand: `org_id, full_name, functie_niveau, email, telefoonnummer, werkvorm, status, geboortedatum, profile_photo_url, bendy_id`
- Nieuw: `voorletters, geboorteplaats, geslacht, bendy_external_id, certificaten`

### 3c: UPDATE pad uitbreiden (bestaande matches)
Naast naam/telefoon/email worden nu ook de nieuwe velden conditioneel gesynchroniseerd (alleen als Bendy waarde heeft EN lokaal null is).

### 3d: BSN opslaan
Na elke INSERT of UPDATE: als `attrs.citizen_service_number` aanwezig is, upsert naar `professional_bsn` tabel.

### 3e: SELECT uitbreiden
De query die professionals ophaalt voor matching moet de nieuwe kolommen ook selecteren voor conditionele updates.

---

## Deel 4: UI -- Professional Detail uitbreiden

### 4a: Professional interface uitbreiden
Toevoegen van `voorletters`, `geboorteplaats`, `geslacht`, `bendy_external_id` aan de interface in `ProfessionalDetailModal.tsx`.

### 4b: Persoonsgegevens sectie uitbreiden
In de bestaande "Persoonsgegevens" collapsible, extra velden tonen:
- Voorletters
- Geboorteplaats
- Geslacht

### 4c: Certificaten tonen
In de "Ervaring" tab, certificaten als badges tonen (indien beschikbaar).

### 4d: BSN weergave (admin-only)
Onder Persoonsgegevens een BSN veld toevoegen dat:
- Alleen zichtbaar is voor gebruikers met admin role (via `useUserRole`)
- Standaard gemaskeerd toont (bijv. `***-***-789`)
- Een "Toon volledig" knop heeft
- Bij onthullen een audit log entry schrijft naar `security_audit_log`

---

## Bestanden die wijzigen

1. `supabase/functions/bendy-sync/index.ts` -- groepen fix, velden uitbreiding, BSN sync
2. `src/components/ProfessionalDetailModal.tsx` -- nieuwe velden tonen + BSN
3. SQL migratie -- nieuwe kolommen + tabellen

## Technische details

```text
fetchAllBendyRecords flow (na fix):
  fetchAllBendyRecords(tenant, '/api/v2/users', { include: 'groups' })
    -> fetchBendyApi(tenant, '/api/v2/users', { include: 'groups', 'page[number]': '1', 'page[size]': '100' })
    -> URL: baseUrl/api/v2/users?include=groups&page[number]=1&page[size]=100

BSN security flow:
  Edge function: attrs.citizen_service_number -> professional_bsn.encrypted_bsn
  UI: supabase.from('professional_bsn').select() -> gemaskeerd tonen
  Onthullen: audit log entry + volledig BSN tonen
  RLS: alleen admin/eigenaar role kan lezen
```

