

# DATA-FIX-3: Diensten updaten vanuit verse cache + sync reset

## Stappen

### 1. Reset sync lock + config
Twee UPDATE statements op `bendy_sync_log` (status→failed) en `bendy_sync_config` (sync_status→idle). Maakt de sync-lock vrij.

### 2. Update diensten-status week 13
JOIN `diensten` met `bendy_raw_cache` op `bendy_id`. Zet `closed` → `volledig_bezet`, `open` → `open`. Filters: datum 23-29 maart, bron=geimporteerd, skip voltooid.

### 3. Verificatie
Read-only query: tel open vs ingepland, posities en uren. Verwacht: open ≈ 3 (was 54), ~176 ingepland, ~1224 uur.

## Technisch
- Stap 1+2: database migration tool (UPDATE statements)
- Stap 3: read query via psql
- Geen schema-wijzigingen, geen code changes

