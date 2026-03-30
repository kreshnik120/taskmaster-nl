

# DIAG-20 Resultaten + Fix Plan

## Diagnose

### Sync logs (laatste 5 requisition syncs)
| status | records_fetched | duur_sec | errors |
|---|---|---|---|
| failed | 0 | 1832 | Auto-cleanup: sync langer dan 30 min |
| failed | 0 | 307 | Handmatig gestopt — SYNC-FIX-1 v2 |
| failed | 0 | 1566 | Handmatig gestopt — SYNC-FIX-1 deploy |
| failed | 0 | 3553 | Handmatig gestopt — DATA-FIX-7 |
| failed | 0 | 1066 | Handmatig gestopt — DATA-FIX-4 |

Alle metadata is leeg — de sync bereikt nooit de verwerkingsfase.

### Sync lock
| sync_status | updated_at |
|---|---|
| **running** | 2026-03-27 15:11:38 |

Lock zit vast sinds **3 dagen**. De cron draait elke minuut, ziet `running`, en skipt in 50ms.

### Waarom SYNC-FIX-2 NIET nodig is
De user dacht dat `_shared/bendy-sync-requisitions.ts` een dood bestand is, maar `index.ts` regel 38 importeert het:
```typescript
import { syncRequisitions } from '../_shared/bendy-sync-requisitions.ts';
```
SYNC-FIX-1 is dus al op het juiste bestand toegepast. De code is correct, maar wordt niet bereikt door de vastgelopen lock.

## Plan: Lock reset + verificatie

### Stap 1 — Reset lock
```sql
UPDATE bendy_sync_config
SET sync_status = 'idle', error_message = NULL, updated_at = NOW()
WHERE tenant = 'citozorg' AND sync_status = 'running';
```

### Stap 2 — Wacht op volgende cron run (1-2 minuten)
De cron triggert elke minuut een incremental sync. Na de reset zou deze moeten slagen.

### Stap 3 — Verificatie (na 2 min)
```sql
SELECT status, records_fetched,
  EXTRACT(EPOCH FROM (completed_at - started_at))::int as duur_sec,
  metadata->'debug_date_filter' as datumfilter,
  metadata->'toewijzingen_created' as tw_created
FROM bendy_sync_log
WHERE entity_type = 'requisitions_open'
ORDER BY started_at DESC
LIMIT 3;
```
Verwacht: `status=success`, `records_fetched` in de honderden, `duur_sec < 120`.

## Technisch
- Eén UPDATE statement via database tool
- Geen code changes nodig
- Geen schema wijzigingen

