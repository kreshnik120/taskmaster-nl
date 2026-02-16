
# BENDY-INSPECT-2: Field Fill Rate Analyse

## Overzicht
Fill rate analyse toevoegen over alle raw_cache records, zodat per Bendy-veld zichtbaar is hoeveel records dat veld gevuld hebben. Drie onderdelen: helper functie, status response uitbreiden, frontend tabel uitbreiden.

## Wijziging 1 -- `supabase/functions/bendy-sync/index.ts`

**1a** Nieuwe `analyzeFieldFillRates` helper functie toevoegen op regel 667 (na de `syncClientsToDatabase` functie, voor het `REQUEST TYPES` commentaar). Bevat:
- `FieldFillRate` interface (field, filled, total, percentage, examples)
- Iteratie over alle rawCacheRecords, verzamelt alle unieke attribute keys
- Per key telt het gevulde records (niet null/undefined/leeg/leeg object/leeg array)
- Verzamelt tot 3 voorbeeldwaarden (afgekapt op 80 tekens)
- Sorteert resultaat op percentage (hoog naar laag)

**1b** Op regel 818 (na `kvkBreakdown.sort()`): `fieldFillRates` berekenen via de helper.

**1c** Op regel 847 (na `sample_record`): `field_fill_rates: fieldFillRates` toevoegen aan het diagnostics object.

## Wijziging 2 -- `src/pages/BendySync.tsx`

**2a** Diagnostics interface (regel 70, na `sample_record`): `field_fill_rates` property toevoegen met het juiste type.

**2b** Tabel header (regel 458-461): Vierde kolom "Vulgraad" toevoegen.

**2c** Tabel body (regel 463-482): Vervangen door uitgebreide map die per veld de fill rate opzoekt en een kleur-badge toont:
- Groen badge (emerald): vulgraad >= 80%
- Amber badge: vulgraad 50-79%
- Rood badge: vulgraad < 50%
- Badge toont "X/Y (Z%)" formaat

## Geen andere bestanden
Alleen `bendy-sync/index.ts` en `BendySync.tsx` worden gewijzigd. Edge function wordt herdeployed.

## Verificatie
- Helper functie analyseert alle records, niet slechts 1 sample
- Response bevat `field_fill_rates` array gesorteerd op percentage
- UI toont 4-koloms tabel met kleurgecodeerde vulgraad badges
