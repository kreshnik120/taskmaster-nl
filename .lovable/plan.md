
# BENDY-FIX-2: Diagnostiek Tellers Fix + Cosmetische Fix

## Overzicht
Fixt de "Bendy clients: 0" teller op de Data Kwaliteit card door de telling te baseren op `bendy_raw_cache` (100 records) in plaats van `pendingMappings` (nu leeg na succesvolle sync). Plus een cosmetische fix voor de records_failed render.

## Wijziging 1 -- `supabase/functions/bendy-sync/index.ts`

### handleStatusCheck() tellers (regels 679-698)
- Verplaats de `rawCacheRecords` query VOOR de `bendyWithKvk` berekening
- Bereken `totalBendyRecords` uit rawCacheRecords length
- Herbereken `bendyWithKvk` uit raw_data attributes (chamber_of_commerce_number) in plaats van pendingMappings conflict_data
- Verwijder de oude bendyWithKvk berekening op basis van pendingMappings

### Response (regels 765-766)
- `bendy_clients_without_kvk` wijzigen van `pendingMappings.length - bendyWithKvk` naar `totalBendyRecords - bendyWithKvk`

## Wijziging 2 -- `src/pages/BendySync.tsx`

### records_failed render (regels 494-497)
- Wrap de `log.records_failed` waarde altijd in een `<span>` element (ook als 0) voor consistente JSX rendering
