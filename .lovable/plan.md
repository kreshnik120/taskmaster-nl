

# BENDY-SYNC-2: Bendy Client Sync Engine

## Overzicht
Nieuwe Edge Function `bendy-sync` die Bendy API clients synchroniseert naar de abcito.io database. Achtergrondproces dat DIRECT naar Bendy API gaat (niet via bendy-proxy). Alleen clients in deze fase.

## Wijziging 1 -- Nieuw bestand: `supabase/functions/bendy-sync/index.ts`

Enterprise sync engine met de volgende onderdelen:

### OAuth2 Token Management
- Zelfde pattern als bendy-proxy: `CachedToken` interface, `tokenCache` Map, `getAccessToken()` functie
- Token cache met 5 minuten expiry margin

### Bendy API Helpers
- `fetchBendyApi(tenant, endpoint, params)`: GET request met Bearer token, 60s timeout via AbortController
- `fetchAllBendyRecords(tenant, endpoint)`: Gepagineerd ophalen met `page[number]` en `page[size]=100`, max 50 pagina's, stopt bij `records.length < PAGE_SIZE` of geen `links.next`

### Sync Lock Mechanisme
- `acquireSyncLock(adminClient, tenant, entityType)`: Checkt `bendy_sync_config` op enabled + niet al running, zet status naar 'running'
- `releaseSyncLock(adminClient, configId, status, errorMessage?)`: Reset naar 'idle' of 'error' na afloop

### Client Sync Logica (`syncClients`)
- Haalt alle Bendy clients op via gepagineerd fetch
- Haalt bestaande `client_organizations` en `bendy_id_mapping` op
- Bouwt lookup maps: kvkMap (kvk_nummer), bendyIdMap (bendy_id), mappingMap
- Per Bendy client:
  - Upsert naar `bendy_raw_cache` (altijd)
  - Match op bendy_id (eerder gekoppeld), dan op KvK-nummer
  - Bij match: update `bendy_id` op client_organizations + upsert mapping met status 'synced'
  - Bij geen match: upsert mapping met status 'pending' + placeholder UUID (geen nieuwe records aanmaken)
  - Max 20 fouten voordat loop stopt

### Main Handler (Deno.serve)
1. CORS preflight via `handleCors(req)`
2. JWT authenticatie via `createAnonClient(authHeader)` + `getUser()`
3. Admin rol check via `user_organizations` (role = 'admin' of 'eigenaar')
4. Parse request body als `BendySyncRequest` (action: 'sync_clients')
5. Circuit breaker check via `canExecute()`
6. Sync lock acquire
7. Sync log insert (status: 'running')
8. `syncClients()` uitvoeren
9. Sync log update (records_fetched/created/updated/skipped/failed, duration_ms, status)
10. Lock release + circuit breaker success
11. Return JSON response met resultaten

### Error Handling
- Hele flow in try/catch
- Bij fout: release lock met 'error', update sync_log met 'failed', record circuit breaker failure

## Wijziging 2 -- Config update: `supabase/config.toml`

Toevoegen na het `[functions.bendy-proxy]` blok (regel 7):

```text
[functions.bendy-sync]
verify_jwt = false
# Purpose: Bendy data sync engine (clients, later users/requisitions)
# Auth: JWT + admin role validated in-code
# Trigger: Manual POST, later cron schedule
```

## Geen wijzigingen aan
- `bendy-proxy` (ongewijzigd)
- `_shared/core.ts` en `_shared/circuit-breaker.ts` (ongewijzigd)
- Frontend componenten, hooks, of pagina's
- Database tabellen (die bestaan al via BENDY-SYNC-1)

## Technische Details

### Request Format
```text
POST /bendy-sync
Authorization: Bearer <user-jwt>
{
  "action": "sync_clients",
  "tenant": "citozorg",        // optioneel, default: citozorg
  "sync_type": "incremental"   // optioneel, default: incremental
}
```

### Response Format
```text
{
  "success": true,
  "data": {
    "action": "sync_clients",
    "tenant": "citozorg",
    "records_fetched": 150,
    "records_updated": 45,
    "records_skipped": 105,
    "records_failed": 0,
    "errors": []
  },
  "metadata": {
    "duration_ms": 3200,
    "sync_log_id": "uuid",
    "sync_type": "incremental"
  }
}
```

### Veiligheidsmaatregelen
- Alleen admin/eigenaar gebruikers kunnen sync triggeren
- Sync lock voorkomt dubbele runs
- Circuit breaker beschermt tegen Bendy API uitval
- Geen nieuwe client_organizations records (alleen bestaande matchen)
- Max 20 fouten per run voordat sync stopt
- Max 50 pagina's per endpoint (5000 records limiet)
