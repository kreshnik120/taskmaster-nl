

# S53-FIX-LOCK: Reset sync lock

## Diagnose
- `bendy_sync_config.sync_status` = **'running'** sinds 2026-03-31 03:00:05 UTC
- Laatste succesvolle sync: 03:00:39 (users entity) — daarna geen runs meer
- Sync draaide correct elke 10 minuten van 02:20 t/m 03:00

## Stap 1: Reset lock via migratie

SQL migratie uitvoeren:

```sql
UPDATE bendy_sync_config
SET sync_status = 'idle', error_message = NULL, updated_at = NOW()
WHERE sync_status = 'running';
```

## Stap 2: Verificatie
Na 5-10 minuten wachten, controleren of nieuwe entries in `bendy_sync_log` verschijnen met `entity_type = 'requisitions_open'`.

## Niet aanraken
- Edge function code, frontend, andere tabellen

