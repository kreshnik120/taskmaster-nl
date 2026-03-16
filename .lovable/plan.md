

# DELTA-SYNC-2-FIX: Frontend sync_type → incremental

## Wijzigingen in `src/pages/BendySync.tsx`

4 regels aanpassen:

1. **Regel 739** — `sync_clients`: `"full"` → `"incremental"`
2. **Regel 768** — `sync_users`: `"full"` → `"incremental"`
3. **Regel 1253** — `sync_documents`: `"full"` → `"incremental"`
4. **Regel 1371** — `sync_requisitions`: voeg `tenant: 'citozorg', sync_type: 'incremental'` toe (ontbreekt nu)

Backend valt automatisch terug op full sync als `last_incremental_sync_at` null is.

