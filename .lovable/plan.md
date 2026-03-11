

# BENDY-REQ-5A-FIX: Requisition Sync Timeout Fix

Three targeted changes in `supabase/functions/bendy-sync/index.ts`, no frontend changes.

## Changes

### 1. Reduce API timeout (line 36)
`BENDY_REQUEST_TIMEOUT_MS`: `60_000` → `25_000`

### 2. Parallel fetch in syncRequisitions (lines 1644-1648)
Replace sequential `fetchAllBendyRecords` calls with `Promise.all` to run open + assigned fetches concurrently.

### 3. Stuck sync auto-cleanup in handleStatusCheck (after line 1881)
After `recentLogs` is fetched, scan for any logs with `status === 'running'` older than 10 minutes and auto-mark them as `failed`. This prevents syncs from getting permanently stuck.

No database changes. No frontend changes. No other sync functions touched.

