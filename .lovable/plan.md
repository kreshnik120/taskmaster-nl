
# BENDY-SYNC-2B: Sync Engine Herschrijving (Sublocatie-niveau)

## Overzicht
Herschrijft de sync engine zodat Bendy "clients" correct gematcht worden op sublocatie-niveau in plaats van organisatie-niveau. Voegt automatisch aanmaken toe van ontbrekende organisaties en sublocaties.

## Wijziging 1 -- Database Migratie (nieuw bestand)

Cleanup migratie met 2 stappen:
1. DELETE oude `bendy_id_mapping` records met entity_type `client` voor citozorg
2. Reset `bendy_id` op `client_organizations` voor CitoZorg org_id (was incorrect overschreven)

## Wijziging 2 -- `supabase/functions/bendy-sync/index.ts`

### 2a. Helper functies (na regel 252, voor regel 254)

Twee nieuwe helpers:
- `deriveOrgName(clients)`: vindt langste gemeenschappelijke prefix van bedrijfsnamen, fallback naar eerste naam
- `normalizeForMatch(str)`: lowercase + trim + spaties normaliseren

### 2b. syncClients() volledig vervangen (regels 254-373)

Nieuwe flow:
1. Ophalen alle Bendy clients via `fetchAllBendyRecords`
2. Groeperen per KvK-nummer (records zonder KvK apart)
3. Per KvK-groep:
   - Zoek bestaande `client_organizations` op KvK + org_id
   - Niet gevonden: auto-aanmaken org + default location via `deriveOrgName()`
   - Registreer org-mapping (entity_type `organization`, bendy_id `kvk-{nummer}`)
   - Haal alle sublocaties op via locations
   - Per Bendy record: 4-niveau matching:
     - Match 1: bestaande bendy_id (exact)
     - Match 2: genormaliseerde naam (exact)
     - Match 3: postcode + adres (exact)
     - Match 4: naam bevat (min 8 tekens)
   - Match gevonden: update sublocation met Bendy data (source of truth)
   - Geen match: auto-aanmaken sublocation met Bendy data
4. Records zonder KvK: opslaan als pending

### 2c. handleStatusCheck() fix (regel 448)

Wijzig entity_type filter van `client` naar `sublocation` voor pending mappings query.

## Wijziging 3 -- `src/pages/BendySync.tsx`

### Sync resultaat grid (regels 438-443)

- Grid van 4 naar 5 kolommen
- "Aangemaakt" kolom toevoegen met groene kleur (records_created)

## Geen andere wijzigingen
- Routing, sidebar, diagnostiek cards blijven identiek
- Alleen syncClients() engine, entity_type filter, en sync result grid
