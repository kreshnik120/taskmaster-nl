-- Verwijder orphan cron jobs die errors genereren
-- ultra-auto-harvester: roept niet-bestaande auto-knowledge-harvester aan (401 errors)
-- invoke-ai-task-scorer: stuurt verkeerde payload (400 errors)

SELECT cron.unschedule('ultra-auto-harvester');
SELECT cron.unschedule('invoke-ai-task-scorer');