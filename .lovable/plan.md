
# BENDY-FIX-4: KvK Verificatie + Contactgegevens Sync

## Overzicht
Drie onderdelen: (1) KvK-nummer invullen voor Stichting Siza, (2) twee nieuwe kolommen toevoegen aan client_sublocations, en (3) sync engine uitbreiden met email, contactpersoon en status synchronisatie.

## Wijziging 1 -- Nieuwe SQL migratie

Nieuw migratiebestand in `supabase/migrations/` met:

**Deel A**: DO $$ blok dat Siza zoekt (LOWER(name) LIKE '%siza%', geen KvK) en kvk_nummer '09103844' invult.

**Deel B**: Twee nieuwe kolommen:
- `ALTER TABLE client_sublocations ADD COLUMN IF NOT EXISTS email TEXT DEFAULT NULL`
- `ALTER TABLE client_sublocations ADD COLUMN IF NOT EXISTS contactpersoon_naam TEXT DEFAULT NULL`
- COMMENT ON COLUMN voor beide

## Wijziging 2 -- `supabase/functions/bendy-sync/index.ts`

### 2a. Helper functie `buildContactName` (na regel 274, voor syncClients)
Combineert `firstname`, `middlename`, `surname` met trim/filter, retourneert null als leeg.

### 2b. SELECT sublocations uitbreiden (regel 404)
Van `'id, naam, adres, postcode, plaats, kostenplaats, telefoon, bendy_id, location_id'`
naar `'id, naam, adres, postcode, plaats, kostenplaats, telefoon, email, contactpersoon_naam, is_active, bendy_id, location_id'`

### 2c. Email, contactpersoon en status sync bij UPDATE (na regel 483, voor regel 485)
- email check: `attrs.email !== matchedSub.email`
- contactpersoon: `buildContactName(attrs) !== matchedSub.contactpersoon_naam`
- status: `attrs.status.toLowerCase() !== 'inactive'` mapped naar `is_active`

### 2d. Email, contactpersoon sync bij INSERT (regels 511-521)
Voeg `email: attrs.email || null` en `contactpersoon_naam: newContactName` toe aan insert object. Geen is_active (default true).

## Geen andere bestanden
Alleen de migratie en de edge function worden gewijzigd.
