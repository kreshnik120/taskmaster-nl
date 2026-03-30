

# SYNC-FIX-3: CPU optimalisatie — skip cache + mapping writes

## Overzicht
Drie chirurgische wijzigingen in `bendy-sync-requisitions.ts` om de CPU-belasting drastisch te verlagen door onnodige DB writes te elimineren.

## Wijzigingen

### Stap 1 — Skip bendy_raw_cache upsert (regel 127, 159-163, 317)
- **Verwijder** het vullen van `cacheWrites` array in de for-loop (regels 159-163: de `cacheWrites.push(...)`)
- **Vervang** regel 317 (`if (cacheWrites.length > 0) await batchUpsert(...)`) door een log-regel:
  ```typescript
  logInfo(FUNCTION_NAME, `Cache upsert overgeslagen: ${cacheWrites.length} records (CPU optimalisatie)`);
  ```
- **Opmerking**: De `cacheWrites` array declaratie (regel 127) en referenties in logProgress kunnen blijven als lege array — geen schade.

### Stap 2 — Skip bendy_id_mapping writes (regel 130, 174-181, 273-279, 336)
- **Verwijder** beide `mappingWrites.push(...)` blokken:
  - Regels 174-181 (in sublocation_miss branch)
  - Regels 273-279 (in success branch)
- **Vervang** regel 336 (`if (mappingWrites.length > 0) await batchUpsert(...)`) door een log-regel:
  ```typescript
  logInfo(FUNCTION_NAME, `Mapping writes overgeslagen: ${mappingWrites.length} records (CPU optimalisatie)`);
  ```
- **Bijeffect**: De mapping-update logica in regels 328-334 (die `local_id` bijwerkt in mappingWrites na upsert) kan ook weg — die data wordt nergens meer gebruikt.

### Stap 3 — Skip stale cleanup bij incremental sync (regels 597-622)
- De huidige code skipt stale cleanup al bij delta sync (regel 619-621: `else { logInfo(..., 'Stale cleanup overgeslagen (delta sync)') }`)
- **Vervang** het full-sync stale-blok (regels 600-618) zodat het OOK bij full sync wordt overgeslagen wanneer datumfiltering actief is:
  ```typescript
  if (!isDelta) {
    // Stale cleanup overgeslagen: bij datumfilter-sync is dit onbetrouwbaar
    logInfo(FUNCTION_NAME, 'Stale cleanup overgeslagen (datumfilter actief, diensten buiten venster zijn niet stale)');
  } else {
    logInfo(FUNCTION_NAME, 'Stale cleanup overgeslagen (delta sync)');
  }
  ```

## Impact
- **Cache upsert**: ~449 volledige JSON records × INSERT = grootste CPU-vreter → **weg**
- **Mapping writes**: ~449 records × INSERT = significant → **weg**  
- **Stale cleanup**: iteratie over 50K+ diensten + individuele UPDATEs → **weg**
- Users cache (voor fucMap in stap 5) wordt al apart bijgewerkt via de users sync — niet aangetast

## Bestand
Alleen `supabase/functions/_shared/bendy-sync-requisitions.ts`

## Niet aanraken
- Fetch-logica (hard cap + datumfilter)
- Diensten upsert/update logica (stap 4)
- Toewijzingen logica (stap 5)
- Alle andere bestanden

## Verificatie
Na deployment: sync triggeren, na 2 min checken:
```sql
SELECT status, records_fetched,
  EXTRACT(EPOCH FROM (completed_at - started_at))::int as duur_sec,
  metadata->'debug_date_filter' as datumfilter,
  metadata->'toewijzingen_created' as tw_created
FROM bendy_sync_log
WHERE entity_type LIKE 'requisitions%'
ORDER BY started_at DESC LIMIT 3;
```
Verwacht: `status=success`, `duur_sec < 30`, `records_fetched ~449`

