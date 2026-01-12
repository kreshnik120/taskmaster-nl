-- Remove orphan cron job for non-existent compliance-extractor function
SELECT cron.unschedule('invoke-compliance-extractor');

-- Remove orphan cron job for non-existent compliance-expert function
SELECT cron.unschedule('invoke-compliance-expert');

-- Remove orphan cron job for non-existent prioritizer function
SELECT cron.unschedule('prioritizer-cron');