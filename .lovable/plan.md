

# FIX-DEDUP-1B: Ontbrekende diensten aanmaken vanuit cache + dienstMap pagination fix

## Probleem
De 12 "geabsorbeerde" Bendy records worden niet opnieuw aangemaakt door de sync omdat:
1. De Bendy API endpoints (`/open` en `/assigned`) retourneren deze 12 bendy_ids waarschijnlijk niet meer
2. De sync leest alleen de API, niet de `bendy_raw_cache`
3. **Bonus bug:** de `dienstMap` prefetch (regel 111) gebruikt `.limit(50000)` maar Supabase kapt af op 1000 rijen → slechts ~1000 van de 2088 bestaande diensten worden geladen, waardoor de sync ~8900 "created" rapporteert (eigenlijk upserts)

## Oplossing (2 onderdelen)

### Onderdeel A: Maak de 12 diensten direct aan vanuit cache-data

Database migratie die de 12 diensten INSERT op basis van de `bendy_raw_cache` data. Alle 12 hebben:
- Geldige sublocation mappings (geverifieerd)
- Status `closed` → wordt `volledig_bezet`
- Geldige datum/tijd attributen

```sql
INSERT INTO diensten (org_id, sublocation_id, bendy_id, titel, datum, start_tijd, eind_tijd, 
  pauze_minuten, status, dienst_type, gevraagd_aantal, bron, accepteerbaar)
SELECT 
  d_existing.org_id,
  cs.id AS sublocation_id,
  brc.bendy_id,
  brc.raw_data->'attributes'->>'name' AS titel,
  (brc.raw_data->'attributes'->>'date')::date AS datum,
  -- extract start/end times from ISO strings
  ...
  'volledig_bezet', 'dag', 1, 'geimporteerd', true
FROM bendy_raw_cache brc
JOIN client_sublocations cs ON cs.bendy_id = (brc.raw_data->'relationships'->'client'->'data'->>'id')
CROSS JOIN (SELECT org_id FROM diensten WHERE bron = 'geimporteerd' LIMIT 1) d_existing
WHERE brc.entity_type = 'requisitions'
  AND brc.bendy_id IN ('17371957','17054825','17301162','16919983','17220283',
    '16513055','16480201','17220285','17174147','16513056','17352594','17243102')
  AND NOT EXISTS (SELECT 1 FROM diensten d WHERE d.bendy_id = brc.bendy_id)
ON CONFLICT (org_id, bendy_id) DO NOTHING;
```

### Onderdeel B: Fix dienstMap pagination (bendy-sync-requisitions.ts)

Vervang de `.limit(50000)` op regel 106-111 door paginated fetching (hetzelfde patroon als al gebruikt voor professionals op regel 390-405):

```typescript
// Was:
const { data: existingDiensten } = await adminClient
  .from('diensten')
  .select('id, bendy_id, status, datum, start_tijd, eind_tijd, sublocation_id')
  .eq('org_id', orgId)
  .not('bendy_id', 'is', null)
  .limit(50000);

// Wordt:
let allExistingDiensten: any[] = [];
let dienstOffset = 0;
const DIENST_PAGE = 1000;
while (true) {
  const { data: chunk } = await adminClient
    .from('diensten')
    .select('id, bendy_id, status, datum, start_tijd, eind_tijd, sublocation_id')
    .eq('org_id', orgId)
    .not('bendy_id', 'is', null)
    .range(dienstOffset, dienstOffset + DIENST_PAGE - 1);
  if (!chunk || chunk.length === 0) break;
  allExistingDiensten.push(...chunk);
  if (chunk.length < DIENST_PAGE) break;
  dienstOffset += DIENST_PAGE;
}
```

Dit lost het "8900 created" probleem op — na deze fix zal de sync correct ~0 created / ~0 updated rapporteren als er niets veranderd is.

## Niet aanraken
- Sync API fetch logica (open/assigned endpoints)
- bendy_raw_cache
- netto_uren kolom
- Frontend code (FIX-UREN-1 revert is al gedaan)

## Verwacht resultaat
- 12 nieuwe diensten in de planning voor week 23-29 maart
- Totaal ingepland: ~184-185 (was 173)
- Sync log toont correcte aantallen (niet meer ~8900 "created")

## Verificatie
Na uitvoering: hercheck VERIF-3 queries (tellingen week 23-29 maart)

