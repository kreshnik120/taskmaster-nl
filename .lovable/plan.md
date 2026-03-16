

# DELTA-SYNC-3: handleCronSync uitbreiden

## Wijzigingen in `bendy-sync/index.ts`

### 1. Cron trigger (regels 464-467)
Voeg `sync_type` door aan `handleCronSync`:
```
const cronSyncType = body.sync_type || 'incremental';
return handleCronSync(cronSyncType);
```

### 2. handleCronSync herschrijven (regels 332-443)
Vervang de huidige functie (alleen `syncClients`) door een multi-entity versie:

- **Signature**: `handleCronSync(syncType: string = 'incremental')`
- **`incremental`**: draait delta requisitions → delta users (met `lock.lastIncrementalSyncAt`)
- **`full`**: draait clients → users → documents → requisitions (sequentieel)
- **Per entity**: eigen `bendy_sync_log` entry met status/duration tracking
- **Error handling**: als één entity faalt, gaat de volgende door (try/catch per entity via `runSync` helper)
- Lock/circuit breaker logica blijft intact

Geen DB migraties, geen UI wijzigingen.

