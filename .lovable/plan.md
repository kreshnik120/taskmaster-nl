
# BENDY-FIX-6: Extra Velden Sync

## Overzicht
6 nieuwe Bendy-velden synchroniseren + mobile fallback voor telefoon. Drie onderdelen: SQL migratie, sync engine aanpassingen, geen UI-wijzigingen.

## Wijziging 1 -- SQL Migratie (nieuw bestand)

5 nieuwe kolommen toevoegen:
- `client_sublocations.interne_opmerking` (TEXT) -- voor Bendy `comment` veld
- `client_organizations.invoice_bedrijfsnaam` (TEXT)
- `client_organizations.invoice_adres` (TEXT)
- `client_organizations.invoice_postcode` (TEXT)
- `client_organizations.invoice_plaats` (TEXT)

Alle met `ADD COLUMN IF NOT EXISTS`, idempotent.

## Wijziging 2 -- `supabase/functions/bendy-sync/index.ts`

**6 aanpassingen in de sync engine:**

1. **SELECT org** (regel 322): invoice-kolommen toevoegen aan select
2. **Org update blok** (regel 338-345): website-only vervangen door batched update van website + 4 factuurvelden (alleen als gewijzigd)
3. **SELECT subs** (regel 414): `publieke_opmerking, interne_opmerking` toevoegen
4. **UPDATE sublocation** (regel 491-506): mobile fallback voor telefoon, `comment_public` en `comment` synchroniseren
5. **INSERT sublocation** (regel 537-547): mobile fallback, `publieke_opmerking` en `interne_opmerking` meegeven

## Geen andere bestanden
Alleen het migratiebestand en `bendy-sync/index.ts` worden gewijzigd.

## Verificatie
- 5 nieuwe kolommen in database
- Org select bevat 4 invoice-kolommen
- Org update synchroniseert website + 4 factuurvelden conditioneel
- Sub select bevat publieke_opmerking + interne_opmerking
- Sub update/insert gebruikt `telephone || mobile` fallback en synchroniseert opmerkingen
