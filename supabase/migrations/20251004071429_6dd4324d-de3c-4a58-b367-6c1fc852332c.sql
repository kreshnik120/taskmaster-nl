-- ============================================
-- STEP 2: Remove Hardcoded Tokens from Triggers
-- ============================================

-- Fix trigger_continuous_learner
-- Remove Authorization header + fix search_path
CREATE OR REPLACE FUNCTION public.trigger_continuous_learner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'assistant' THEN
    PERFORM net.http_post(
      url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/continuous-learner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'user_question', (
          SELECT content 
          FROM public.chat_messages 
          WHERE id = NEW.id - 1 
          AND conversation_id = NEW.conversation_id
        ),
        'ai_response', NEW.content,
        'trigger', 'database_trigger',
        'message_id', NEW.id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Fix trigger_document_processing
-- Remove Authorization header + fix search_path
CREATE OR REPLACE FUNCTION public.trigger_document_processing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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