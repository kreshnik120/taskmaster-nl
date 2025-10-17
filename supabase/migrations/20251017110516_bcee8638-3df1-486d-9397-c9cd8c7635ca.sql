-- Complete P0 STAP 2: Register remaining 9 missing cron jobs

-- smart-deduplicator (every 30 minutes)
SELECT cron.schedule(
  'smart-deduplicator-cron',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/smart-deduplicator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb
  ) AS request_id;
  $$
);

-- data-quality-auditor (every 20 minutes)
SELECT cron.schedule(
  'data-quality-auditor-cron',
  '*/20 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/data-quality-auditor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb
  ) AS request_id;
  $$
);

-- source-validator (every 35 minutes)
SELECT cron.schedule(
  'source-validator-cron',
  '*/35 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/source-validator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb
  ) AS request_id;
  $$
);

-- synapse-pruner (daily at 03:00)
SELECT cron.schedule(
  'synapse-pruner-cron',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/synapse-pruner',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb
  ) AS request_id;
  $$
);

-- meta-orchestrator (daily at 02:00)
SELECT cron.schedule(
  'meta-orchestrator-cron',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/meta-orchestrator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb
  ) AS request_id;
  $$
);

-- retroactive-training-evaluator (daily at 02:00)
SELECT cron.schedule(
  'retroactive-training-evaluator-cron',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/retroactive-training-evaluator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb
  ) AS request_id;
  $$
);

-- client-communication-coach (daily at 04:00)
SELECT cron.schedule(
  'client-communication-coach-cron',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/client-communication-coach',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb
  ) AS request_id;
  $$
);

-- professional-enricher (daily at 05:00)
SELECT cron.schedule(
  'professional-enricher-cron',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/professional-enricher',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb
  ) AS request_id;
  $$
);

-- prioritizer (every hour)
SELECT cron.schedule(
  'prioritizer-cron',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/prioritizer',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb
  ) AS request_id;
  $$
);