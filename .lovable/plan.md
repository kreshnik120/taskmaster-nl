

# BENDY-REQ-5B-FIX-2: Debug API response + profMap limit fix

## Twee problemen

1. **fucMap = 0**: De `/api/v2/flex_user_companies` API fetch levert geen bruikbare mappings — we weten niet waarom (geen records? andere relationship keys? IDs matchen niet?)
2. **profMap = 1000**: Supabase default limit kapt af bij 1000 rijen, mist 427 professionals

## Wijzigingen

### 1. Sample logging toevoegen (`supabase/functions/bendy-sync/index.ts`, regels 1958-1993)

Na de `flex_user_companies` API fetch, vóór het bouwen van fucMap, sample data vastleggen:
- `sampleFucIds`: eerste 3 flex_user_company IDs uit requisitions
- `debugApiTotalRecords`: hoeveel records de API teruggaf
- `debugApiSample`: eerste 3 records met alle relationship keys en waarden
- `debugApiIncludedTypes`: telling per type in de included array

Alle debug data wordt opgeslagen in het metadata object van de sync log (wijziging 3).

### 2. profMap chunked fetch (`supabase/functions/bendy-sync/index.ts`, regels 2024-2035)

Vervang de `.limit(50000)` query door een chunked fetch met `.range()`:
- Fetch in blokken van 1000 records
- Combineer alle chunks in één array
- Stop als een chunk kleiner is dan 1000 of leeg
- Dit omzeilt de Supabase default limit

### 3. Metadata update uitbreiden (regels 2122-2131)

Voeg 4 debug velden toe aan het bestaande metadata object:
- `debug_sample_fuc_ids`
- `debug_api_total_records`
- `debug_api_sample`
- `debug_api_included_types`

### Niet aanraken
- Overlap trigger, cleanup, frontend, database schema, andere syncs

