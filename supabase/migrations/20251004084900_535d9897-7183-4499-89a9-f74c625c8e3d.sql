-- Safe unschedule: only try to unschedule if job exists
DO $$
BEGIN
  -- Try to unschedule master-scheduler-autonomous (ignore if doesn't exist)
  BEGIN
    PERFORM cron.unschedule('master-scheduler-autonomous');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignore error if job doesn't exist
  END;

  -- Try to unschedule master-scheduler (ignore if doesn't exist)
  BEGIN
    PERFORM cron.unschedule('master-scheduler');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignore error if job doesn't exist
  END;
END $$;

-- Schedule master-scheduler to run every 5 minutes
SELECT cron.schedule(
  'master-scheduler-autonomous',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/master-scheduler',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbG1zbWNncnllb3J5aG9uZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzI2MzcsImV4cCI6MjA3NDc0ODYzN30.4yzi0KrVphgkf_bDMdNYWCYKTOg8LJtLlWAq9Ajzkw0"}'::jsonb,
    body := jsonb_build_object(
      'trigger', 'pg_cron',
      'timestamp', NOW()::text
    )
  ) AS request_id;
  $$
);