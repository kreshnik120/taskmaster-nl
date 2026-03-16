

# DELTA-SYNC-2: Delta fetch voor professional sync

## Wijzigingen

### 1. `_shared/bendy-sync-users.ts`

**Import**: Voeg `fetchDeltaBendyRecords` toe aan de import van `bendy-helpers.ts` (regel 8).

**Signature** (regel 21-26): Hernoem `_syncType` → `syncType`, voeg `lastSyncAt?: string | null` toe.

**User fetch** (regel 30): Vervang de enkele `fetchAllBendyRecords` call door delta/full conditie:
- `isDelta = syncType === 'incremental' && lastSyncAt`
- `cutoffDate = lastSyncAt - 60s`
- Delta → `fetchDeltaBendyRecords(tenant, '/api/v2/users', cutoffDate, { include: 'groups,company' })`
- Full → bestaande `fetchAllBendyRecords` call

Groups en selection_lists fetches blijven ongewijzigd.

### 2. `bendy-sync/index.ts`

**Regel 574**: Voeg `capturedLastSyncAt` toe aan syncUsers call:
```
result = await syncUsers(bgAdminClient, tenant, orgId, syncType, capturedLastSyncAt);
```

Geen DB migraties, geen UI wijzigingen.

