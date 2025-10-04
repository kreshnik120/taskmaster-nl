-- ============================================
-- FIX: Register 8 Missing Tier 1 Cron Jobs
-- ============================================

-- 1. prioritizer (elke 5 min - HIGH PRIORITY)
SELECT cron.schedule(
  'invoke-prioritizer',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/prioritizer',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "cron", "autonomous": true}'::jsonb
  ) as request_id;
  $$
);

-- 2. ai-task-scorer (elke 5 min - HIGH PRIORITY)
SELECT cron.schedule(
  'invoke-ai-task-scorer',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/ai-task-scorer',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "cron", "autonomous": true}'::jsonb
  ) as request_id;
  $$
);

-- 3. professional-matcher (elke 10 min)
SELECT cron.schedule(
  'invoke-professional-matcher',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/professional-matcher',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "cron", "autonomous": true}'::jsonb
  ) as request_id;
  $$
);

-- 4. planning-optimizer (elke 15 min)
SELECT cron.schedule(
  'invoke-planning-optimizer',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/planning-optimizer',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "cron", "autonomous": true}'::jsonb
  ) as request_id;
  $$
);

-- 5. tariff-analyzer (elke 20 min)
SELECT cron.schedule(
  'invoke-tariff-analyzer',
  '*/20 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/tariff-analyzer',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "cron", "autonomous": true}'::jsonb
  ) as request_id;
  $$
);

-- 6. client-intelligence (elke 30 min)
SELECT cron.schedule(
  'invoke-client-intelligence',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/client-intelligence',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "cron", "autonomous": true}'::jsonb
  ) as request_id;
  $$
);

-- 7. compliance-extractor (elke 4 uur)
SELECT cron.schedule(
  'invoke-compliance-extractor',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/compliance-extractor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "cron", "autonomous": true}'::jsonb
  ) as request_id;
  $$
);

-- 8. compliance-expert (elke 6 uur)
SELECT cron.schedule(
  'invoke-compliance-expert',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/compliance-expert',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "cron", "autonomous": true}'::jsonb
  ) as request_id;
  $$
);

-- ============================================
-- OPTIONAL: Accelerate Slow Jobs (15min instead of 1h)
-- ============================================

-- Update compliance-monitor (was: 25 * * * *, now: */15 * * * *)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'invoke-compliance-monitor'),
  schedule := '*/15 * * * *'
);

-- Update data-quality-auditor (was: 20 * * * *, now: */15 * * * *)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'invoke-data-quality-auditor'),
  schedule := '*/15 * * * *'
);

-- Update smart-deduplicator (was: 30 * * * *, now: */15 * * * *)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'invoke-smart-deduplicator'),
  schedule := '*/15 * * * *'
);

-- Update source-validator (was: 35 * * * *, now: */15 * * * *)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'invoke-source-validator'),
  schedule := '*/15 * * * *'
);