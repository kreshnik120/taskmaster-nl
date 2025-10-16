-- Register auto-restart-backfill cron job (every 5 minutes)
SELECT cron.schedule(
  'auto-restart-backfill',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/auto-restart-backfill',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb
  ) AS request_id;
  $$
);

-- Register system-health-monitor cron job (every 10 minutes)
SELECT cron.schedule(
  'system-health-monitor',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/system-health-monitor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb
  ) AS request_id;
  $$
);