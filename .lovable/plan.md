

# DELTA-SYNC-1: Delta fetch voor requisition sync

## Overzicht
Bij `sync_type: 'incremental'` alleen recent gewijzigde requisitions ophalen via `sort=-updated_at` met early-stop. Full sync blijft ongewijzigd.

## Wijzigingen

### 1. `_shared/bendy-helpers.ts`

**A. Nieuwe export `fetchDeltaBendyRecords`** (na `fetchAllBendyRecords`, ~regel 195)
- Paginatie met `sort: '-updated_at'`
- Telt per pagina hoeveel records nieuwer zijn dan `cutoffDate`
- Als 0 nieuwe records op een pagina → early stop
- Records zonder `updated_at` = behandeld als nieuw (veilig)
- Return type: `FetchResult & { earlyStop: boolean; pagesScanned: number }`

**B. `acquireSyncLock` uitbreiden**
- Select ook `last_incremental_sync_at`
- Return type krijgt `lastIncrementalSyncAt: string | null`
- Alle 4 return paden bijwerken

### 2. `_shared/bendy-sync-requisitions.ts`

**Signature + STAP 1 fetch**
- Voeg `syncType` en `lastSyncAt` parameters toe
- Import `fetchDeltaBendyRecords` uit helpers
- Als `syncType === 'incremental' && lastSyncAt`: gebruik delta fetch met cutoff = `lastSyncAt - 60s`
- Anders: bestaande full fetch (ongewijzigd)

### 3. `bendy-sync/index.ts`

**Caller code** (~regel 561-577)
- Capture `lock.lastIncrementalSyncAt`
- Geef door aan `syncRequisitions(..., capturedLastSyncAt)`

## Verwacht resultaat
- Eerste sync (geen `last_incremental_sync_at`): full sync (~42k records, ~70s)
- Volgende incrementals: ~100-500 records, ~3-8s
- `sync_type: 'full'` negeert delta altijd

