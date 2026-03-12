
Doel: gerichte debug-instrumentatie toevoegen voor `sync_requisitions` zodat je in `bendy_sync_log.errors` exact ziet tot welke stap de sync kwam vóór een crash/timeout.

Wat ik heb geverifieerd in de code:
- `syncRequisitions()` bestaat al met parallel fetch en 25s timeout.
- `syncRequisitions()` accepteert nu nog géén `syncLogId`.
- De aanroep in `EdgeRuntime.waitUntil` geeft nu nog géén `capturedSyncLogId` door.
- `handleStatusCheck()` en frontend blijven buiten scope (zoals gevraagd).

Implementatieplan (alleen `supabase/functions/bendy-sync/index.ts`):
1. `syncRequisitions` signature uitbreiden  
   - Van: `(adminClient, tenant, orgId, _syncType)`  
   - Naar: `(adminClient, tenant, orgId, _syncType, syncLogId?)`

2. Lokale helper `logProgress(step, data)` toevoegen binnen `syncRequisitions`  
   - Update op `bendy_sync_log` met:
     - `errors: ["STAP: ...", "<json data max 500 chars>"]`
   - Guard:
     - direct return als `!syncLogId`
     - `try/catch` rondom update zodat logging zelf nooit de sync kan breken

3. 4 checkpoint-logs toevoegen in `syncRequisitions`
   - Na fetch van open+assigned:
     - `1-FETCH` met `{ open, assigned, total }`
   - Na lokale prefetch (`dienstMap` + `subMap`):
     - `2-PREFETCH` met `{ existingDiensten, sublocations }`
   - Na in-memory verwerkingsloop:
     - `3-VERWERKT` met `{ inserts, updates, skipped, failed, cache }`
   - Na batch writes (vóór eind `logInfo`/`return`):
     - `4-GESCHREVEN` met `{ created, updated }`

4. Aanroep aanpassen in background routing
   - In `capturedAction === 'sync_requisitions'`:
     - Van: `syncRequisitions(bgAdminClient, tenant, orgId, syncType)`
     - Naar: `syncRequisitions(bgAdminClient, tenant, orgId, syncType, capturedSyncLogId)`

Niet aanpassen:
- Geen frontend wijzigingen (`BendySync.tsx`)
- Geen schema/migraties
- Geen wijzigingen aan andere sync functies

Verificatie na implementatie:
1. Reset Lock op `/bendy-sync`
2. Start “Requisition Sync”
3. Bij falen: inspecteer `bendy_sync_log.errors` van die run
   - Laatste `STAP:*` toont exact waar het stopte
   - Geen stap aanwezig => falen vóór eerste checkpoint (bijv. token/API init)
