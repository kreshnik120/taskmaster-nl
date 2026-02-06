-- Verwijder de duplicate trigger die dubbele inserts veroorzaakt
DROP TRIGGER IF EXISTS log_task_description_trigger ON public.tasks;