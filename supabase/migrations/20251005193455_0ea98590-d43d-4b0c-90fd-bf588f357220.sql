-- Fix trigger_continuous_learner to reliably get user question
-- Uses conversation_id + created_at instead of UUID arithmetic
CREATE OR REPLACE FUNCTION public.trigger_continuous_learner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_question TEXT;
BEGIN
  -- Only trigger for assistant messages
  IF NEW.role = 'assistant' THEN
    
    -- Get the most recent user message in this conversation BEFORE this assistant message
    SELECT content INTO v_user_question
    FROM public.chat_messages
    WHERE conversation_id = NEW.conversation_id
      AND role = 'user'
      AND created_at < NEW.created_at
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Only call continuous-learner if we found a user question
    IF v_user_question IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/continuous-learner',
        headers := jsonb_build_object(
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'user_question', v_user_question,
          'ai_response', NEW.content,
          'trigger', 'database_trigger',
          'message_id', NEW.id,
          'user_id', NEW.user_id,
          'conversation_id', NEW.conversation_id
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Verify trigger is still active
ALTER TABLE public.chat_messages 
  ENABLE TRIGGER after_chat_message_autonomous_learning;