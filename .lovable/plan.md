
# TIMEOUT-FIX: Batch DB Writes in bendy-sync

## Probleem
De sync verwerkt 915+ professionals met 3-4 individuele DB queries per record (cache + professional + BSN + mapping). Dat zijn 3.660+ queries die de 60-seconden Edge Function timeout overschrijden.

## Oplossing
Verander de DB writes van individueel (per record) naar batch/parallel. Business logica (matching, veld-mapping, status, functie_niveau) blijft 100% identiek.

## Wijzigingen in 1 bestand

**Bestand:** `supabase/functions/bendy-sync/index.ts`

### 1. Nieuwe batch helper functies (na regel 210, voor de sync lock sectie)

Drie helpers:
- `batchUpsert(adminClient, table, records, onConflict)` -- upsert in chunks van 200
- `batchInsert(adminClient, table, records)` -- insert in chunks van 200, retourneert IDs
- `parallelUpdates(adminClient, table, updates)` -- parallel update in chunks van 50

Plus constanten: `BATCH_CHUNK_SIZE = 200`, `PARALLEL_CHUNK_SIZE = 50`

### 2. syncUsers herschrijven (regel 806-1053)

Twee fasen in plaats van een monolithische for-loop:

**Fase 1 (in-memory):** Loop door alle bendyUsers, verzamel data in arrays:
- `cacheWrites[]` -- raw cache records
- `proUpdates[]` -- bestaande professionals updaten (id + data)
- `proInserts[]` -- nieuwe professionals aanmaken (insertData + bendyId + bsn)
- `bsnWrites[]` -- BSN records
- `mappingWrites[]` -- ID mapping records

Alle matching/veld-mapping/status logica is identiek aan de huidige code.

**Fase 2 (batch writes):** Voer alle DB writes uit als batches:
- `batchUpsert` voor cache (915 records in 5 chunks)
- `parallelUpdates` voor professional updates (in chunks van 50)
- `batchInsert` voor nieuwe professionals (retourneert IDs)
- Koppel returned IDs terug voor BSN + mapping
- `batchUpsert` voor BSN en mapping records

### 3. syncDocuments herschrijven (regel 1059-1188)

Per chunk van 10 professionals (parallel):
- Parallel API calls voor documenten ophalen (`Promise.allSettled`)
- Parallel bestaande docs ophalen per chunk
- Verzamel alle writes in arrays per chunk
- Batch writes voor cache, inserts, updates, en pro meta-updates

### 4. Geen andere wijzigingen
- syncClients: ongewijzigd (klein genoeg)
- Helper functies: ongewijzigd
- Lock/circuit breaker: ongewijzigd
- Frontend: ongewijzigd
- Database: geen migraties

## Performance verwachting

```text
                        Voor (individueel)    Na (batch)
syncUsers DB queries    3.660                 ~33
syncDocuments           ~3.700 seq            ~92 batch + parallel API
Geschatte totale tijd   >110 sec (TIMEOUT)    ~16 sec
```

## Technische details

```text
Batch helpers:
  batchUpsert: chunks van 200, upsert met onConflict
  batchInsert: chunks van 200, insert + select('id') voor ID terugkoppeling
  parallelUpdates: chunks van 50, Promise.all per chunk

syncUsers flow:
  Fase 1: for-loop verzamelt in 5 arrays (geen DB calls)
  Fase 2: 5 batch operaties (cache, updates, inserts, BSN, mapping)
  Insert ID terugkoppeling: newPros[idx].id -> proInserts[idx] voor BSN + mapping

syncDocuments flow:
  DOC_PARALLEL_SIZE = 10 professionals per chunk
  Promise.allSettled voor API calls + existing docs ophalen
  Batch writes per chunk (cache, doc inserts, doc updates, pro meta)
```
