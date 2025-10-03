-- Unschedule existing ULTRA-SYSTEEM cron jobs
SELECT cron.unschedule('ultra-auto-harvester');
SELECT cron.unschedule('ultra-knowledge-graph');
SELECT cron.unschedule('ultra-self-trainer');

-- Schedule auto-knowledge-harvester to run every 5 minutes
SELECT cron.schedule(
  'ultra-auto-harvester',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/auto-knowledge-harvester',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Schedule knowledge-graph-builder to run every 5 minutes
SELECT cron.schedule(
  'ultra-knowledge-graph',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/knowledge-graph-builder',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"mode": "ULTRA"}'::jsonb
  ) as request_id;
  $$
);

-- Schedule self-trainer to run every 5 minutes
SELECT cron.schedule(
  'ultra-self-trainer',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/self-trainer',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"mode": "auto"}'::jsonb
  ) as request_id;
  $$
);