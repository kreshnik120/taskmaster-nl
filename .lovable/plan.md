
# BENDY-SYNC-3: Cron Job + Status Monitoring

## Overzicht
Uitbreiding van de bestaande `bendy-sync` Edge Function met 3 modes: GET (status check), POST + cron trigger, en POST + manuele admin trigger. Plus cron schedule in config.toml.

## Wijziging 1 -- `supabase/functions/bendy-sync/index.ts`

### Toevoegen: `handleStatusCheck()` functie (voor regel 385)
- GET endpoint zonder authenticatie (monitoring)
- Haalt `bendy_sync_config` records op (alle tenants)
- Haalt laatste 20 `bendy_sync_log` entries op
- Telt `bendy_id_mapping` records (pending vs synced)
- Telt `bendy_raw_cache` records
- Retourneert JSON met configs, recent_logs, en statistics

### Toevoegen: `handleCronSync()` functie (na handleStatusCheck)
- Cron endpoint zonder JWT auth (server-side achtergrondproces)
- Haalt alle `bendy_sync_config` records op waar `enabled = true`
- Per enabled tenant:
  - Skip als niet in TENANT_CONFIG, al running, of circuit breaker open
  - acquireSyncLock, sync log insert, syncClients, sync log update, releaseSyncLock
  - Per-tenant try/catch: bij fout lock release + circuit breaker failure
- Retourneert resultaten per tenant

### Vervangen: Main handler (regels 389-571)
Nieuwe flow met 3 modes:
1. **GET** -> `handleStatusCheck()` (geen auth)
2. **POST + body.trigger === 'scheduler'** -> `handleCronSync()` (geen auth, cron)
3. **POST + Authorization header** -> bestaande manuele sync logica (admin auth)

De manuele sync logica blijft identiek aan de huidige implementatie, alleen verplaatst naar mode 3 in de nieuwe handler structuur. Log messages krijgen "Manuele sync" prefix.

## Wijziging 2 -- `supabase/config.toml` (regels 9-13)

Toevoegen van `schedule = "*/15 * * * *"` aan het bestaande `[functions.bendy-sync]` blok. Comments bijgewerkt om de 3 modes te documenteren.

## Wat NIET verandert
- OAuth2 logica (regels 60-127)
- fetchBendyApi + fetchAllBendyRecords (regels 133-190)
- acquireSyncLock + releaseSyncLock (regels 196-239)
- syncClients + SyncResult (regels 245-373)
- BendySyncRequest interface (regels 379-383)
- Geen andere edge functions of frontend code

## Technische Details

### Drie Request Modes

```text
GET  /bendy-sync                                    -> Status check (geen auth)
POST /bendy-sync  { "trigger": "scheduler" }        -> Cron sync (geen auth, alle enabled tenants)
POST /bendy-sync  { "action": "sync_clients", ... } -> Manuele sync (JWT + admin role)
```

### Cron Veiligheid
- Cron doet NIETS als geen tenants `enabled = true` hebben in `bendy_sync_config`
- Per tenant: skip bij running status, circuit breaker open, of ontbrekende TENANT_CONFIG
- Fouten in tenant A stoppen sync van tenant B niet (per-tenant error isolation)
