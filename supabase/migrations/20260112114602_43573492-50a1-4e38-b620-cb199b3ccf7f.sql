-- Verwijder orphan cron job voor niet-bestaande tariff-analyzer edge function
-- Deze job (jobid 20) genereert elke 20 minuten 403 errors
SELECT cron.unschedule('invoke-tariff-analyzer');