-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Register cron job for compliance-monitor (every hour at minute 25)
SELECT cron.schedule(
  'invoke-compliance-monitor',
  '25 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/compliance-monitor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  );
  $$
);

-- Register cron job for smart-deduplicator (every hour at minute 30)
SELECT cron.schedule(
  'invoke-smart-deduplicator',
  '30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/smart-deduplicator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  );
  $$
);

-- Register cron job for category-classifier (daily at 03:00)
SELECT cron.schedule(
  'invoke-category-classifier',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/category-classifier',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  );
  $$
);

-- Register cron job for data-quality-auditor (every hour at minute 20)
SELECT cron.schedule(
  'invoke-data-quality-auditor',
  '20 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/data-quality-auditor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  );
  $$
);

-- Register cron job for source-validator (every hour at minute 35)
SELECT cron.schedule(
  'invoke-source-validator',
  '35 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/source-validator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  );
  $$
);

-- Register cron job for client-communication-coach (daily at 02:00)
SELECT cron.schedule(
  'invoke-client-communication-coach',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/client-communication-coach',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  );
  $$
);

-- Register cron job for mega-forecast-generator (every Monday at 01:00)
SELECT cron.schedule(
  'invoke-mega-forecast-generator',
  '0 1 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/mega-forecast-generator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  );
  $$
);

-- Register cron job for professional-enricher (every 8 hours at minute 55)
SELECT cron.schedule(
  'invoke-professional-enricher',
  '55 */8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/professional-enricher',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  );
  $$
);