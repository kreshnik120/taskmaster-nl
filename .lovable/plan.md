
# BENDY-INSPECT: Raw Data Velden Inzichtelijk Maken

## Overzicht
Twee wijzigingen: (1) sample record data meesturen in de status response, en (2) een nieuwe "Bendy Velden Analyse" card in de UI.

## Wijziging 1 -- `supabase/functions/bendy-sync/index.ts`

Na de `kvkBreakdown.sort()` op regel 791, voor het `return jsonResponse()` op regel 793:

- Sample record en attributes array berekenen uit `rawCacheRecords[0].raw_data`
- `sample_attributes` en `sample_record` toevoegen aan het `diagnostics` object in de response

## Wijziging 2 -- `src/pages/BendySync.tsx`

Nieuwe Card "Bendy Velden Analyse" toevoegen na de KvK Matching Overzicht card (na regel 421):

- Import `CheckCircle2` en `MinusCircle` uit lucide-react
- Constante `SYNCED_FIELDS` met de lijst van gesynchroniseerde veldnamen
- Samenvatting bovenaan: "X van Y velden gesynchroniseerd" met groene/grijze badges
- Tabel met 3 kolommen: Veld, Waarde (voorbeeld, afgekapt op 80 tekens), Gesynchroniseerd (groen vinkje of grijs minteken)
- Teal achtergrond accent op gesynchroniseerde rijen

## Geen andere bestanden
Alleen deze 2 bestanden worden gewijzigd.
