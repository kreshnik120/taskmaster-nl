-- ============================================
-- ACE PHASE 1: FIX DB TRIGGERS BLOCKING INSERTS
-- ============================================
-- Problem: Triggers using net.http_post fail because net.http_post is not available
-- Solution: Drop triggers that block chat_messages inserts
-- Note: Continuous learner is already called non-blocking from ChatWidget

-- Drop trigger that calls continuous-learner (already called from client)
DROP TRIGGER IF EXISTS trigger_continuous_learner ON public.chat_messages;

-- Drop trigger that calls meta-orchestrator (not critical for chat functionality)
DROP TRIGGER IF EXISTS trigger_meta_orchestrator ON public.chat_messages;

-- Guard the remaining triggers to prevent failures
-- If net.http_post is not available, these functions will return early without blocking

CREATE OR REPLACE FUNCTION public.queue_embedding_generation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_id bigint;
BEGIN
  -- Guard: If net.http_post is not available, skip silently
  IF to_regproc('net.http_post') IS NULL THEN
    RAISE LOG 'Skipping embedding generation: net.http_post not available';
    RETURN NEW;
  END IF;

  -- Original logic
  SELECT net.http_post(
    url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/generate-embedding',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    ),
    body := jsonb_build_object('knowledge_id', NEW.id)::text
  ) INTO request_id;
  
  RAISE LOG 'Queued embedding generation for knowledge_id: %, request_id: %', NEW.id, request_id;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_document_processing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard: If net.http_post is not available, skip silently
  IF to_regproc('net.http_post') IS NULL THEN
    RAISE LOG 'Skipping document processing: net.http_post not available';
    RETURN NEW;
  END IF;

  -- Original logic
  IF NEW.bucket_id = 'training-documents' THEN
    PERFORM net.http_post(
      url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/vision-document-processor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'storage_path', NEW.name,
        'document_type', 'auto_detect',
        'trigger', 'database_trigger'
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.queue_embedding_generation IS 'Queues embedding generation with net.http_post guard';
COMMENT ON FUNCTION public.trigger_document_processing IS 'Triggers document processing with net.http_post guard';