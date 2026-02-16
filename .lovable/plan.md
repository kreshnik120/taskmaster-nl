
# BENDY-FIX-3: Data Fix Prisma Duplicaat + Sync Engine Verrijking

## Overzicht
Twee onderdelen: (1) SQL migratie om de duplicaat "Dr. Kuyperstraat" organisatie samen te voegen met de bestaande "Stichting Prisma", en (2) telefoon + website synchronisatie toevoegen aan de sync engine.

## Wijziging 1 -- Nieuwe SQL migratie

DO $$ blok dat:
- Stichting Prisma zoekt (LOWER(name) LIKE '%prisma%', geen KvK)
- Dr. Kuyperstraat zoekt (kvk_nummer = '41100695')
- IF-guard: alleen als beide gevonden en niet dezelfde
- KvK invullen op Prisma, sublocaties verplaatsen, bendy_id_mapping updaten, Dr. Kuyperstraat verwijderen (locaties + org)

## Wijziging 2 -- `supabase/functions/bendy-sync/index.ts`

### 2a. SELECT org: website toevoegen (regel 312)
Van `'id, name, bendy_id'` naar `'id, name, bendy_id, website'`

### 2b. Website update op bestaande org (na regel 326)
Nieuw blok: als Bendy data een website heeft en org.website leeg is, update de organisatie.

### 2c. SELECT sublocations: telefoon toevoegen (regel 395)
Voeg `telefoon` toe aan de select string.

### 2d. Telefoon sync bij UPDATE (na regel 471)
Nieuw check-blok: `attrs.telephone !== matchedSub.telefoon` dan `updateData.telefoon`.

### 2e. Telefoon sync bij INSERT (regel 506)
Voeg `telefoon: attrs.telephone || null` toe aan het insert object.

## Geen andere bestanden
Alleen de migratie en de edge function worden gewijzigd.
