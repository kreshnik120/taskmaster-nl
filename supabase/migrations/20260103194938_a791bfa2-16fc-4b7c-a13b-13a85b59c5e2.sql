-- Enterprise Cleanup Fase 3: Drop legacy backup tabellen
-- Data verificatie: beide tabellen zijn 80+ dagen oud, geen FK dependencies

DROP TABLE IF EXISTS public.chat_messages_old_backup;
DROP TABLE IF EXISTS public.ai_learning_events_backup_pre_nullable;