

# S53-FIX-CRON-FINAL: pg_cron job 41 naar full sync

## Huidige situatie
- **Job 41**: `*/10 * * * *` met `sync_type: "incremental"` — doet niets nuttigs
- **Job 42**: `0 3 * * *` met `sync_type: "full"` — enige werkende sync

## Wijziging
Eén SQL statement via migratie — alleen de `command` van job 41 wijzigen (schedule blijft `*/10`):

```sql
SELECT cron.alter_job(41,
  command := $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/bendy-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "scheduler", "sync_type": "full"}'::jsonb
  ) AS request_id;
  $$
);
```

Dit kan **niet** via de migratie-tool (bevat project-specifieke secrets). Moet via `supabase--read_query` of een insert-tool uitgevoerd worden.

## Niet aanraken
- Job 42 (dagelijks 03:00 backup) blijft ongewijzigd
- Edge function code, frontend, andere tabellen

## Verificatie
Na 10-15 minuten checken of `bendy_sync_log` nieuwe entries toont met daadwerkelijke data (records_created/updated > 0).

