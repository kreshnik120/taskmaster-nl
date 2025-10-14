-- ACE PHASE 0: FOUNDATION FIXES
-- Fix 1: Reset vastgelopen embeddings backfill
-- Fix 2: Kill source-validator zombie process
-- Fix 3: Auto-trigger continuous learner na elke AI chat

-- =====================================================
-- FIX 1: RESET EMBEDDINGS BACKFILL ORCHESTRATOR
-- =====================================================
UPDATE orchestrator_state 
SET 
  status = 'error',
  metadata = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{error}',
        '"Manual reset - stale heartbeat >24h (last: 2025-10-13 19:12:42)"'
      ),
      '{reset_at}',
      to_jsonb(NOW()::text)
    ),
    '{reset_reason}',
    '"ACE Phase 0 - Foundation Fix"'
  )
WHERE id = 'a000bd6d-6000-433e-89c0-51df6e1d6f58';

-- =====================================================
-- FIX 2: KILL SOURCE-VALIDATOR ZOMBIE PROCESS
-- =====================================================
SELECT cron.unschedule(12);

-- =====================================================
-- FIX 3: AUTO-TRIGGER CONTINUOUS LEARNER
-- =====================================================

-- Create trigger function
CREATE OR REPLACE FUNCTION public.trigger_continuous_learner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_org_id UUID;
  prev_message RECORD;
BEGIN
  -- Alleen voor assistant messages (AI antwoorden)
  IF NEW.role = 'assistant' THEN
    
    -- Haal vorige user message op (de vraag)
    SELECT * INTO prev_message
    FROM chat_messages
    WHERE conversation_id = NEW.conversation_id
      AND role = 'user'
      AND created_at < NEW.created_at
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Haal org_id van user op
    SELECT uo.org_id INTO user_org_id
    FROM user_organizations uo
    WHERE uo.user_id = NEW.user_id
    LIMIT 1;
    
    -- Alleen doorsturen als we data hebben
    IF user_org_id IS NOT NULL AND prev_message.id IS NOT NULL THEN
      
      -- Async call naar continuous-learner via pg_net
      PERFORM net.http_post(
        url := 'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/continuous-learner',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
        ),
        body := jsonb_build_object(
          'user_question', prev_message.content,
          'ai_response', NEW.content,
          'knowledge_used', NEW.metadata->'knowledge_ids_for_feedback',
          'user_feedback', null,
          'auto_apply', true,
          'trigger_source', 'database_trigger'
        )::text
      );
      
      -- Log de trigger (voor monitoring)
      RAISE LOG 'Continuous Learner triggered for conversation_id: %, message_id: %', 
        NEW.conversation_id, NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Activeer trigger op chat_messages tabel
DROP TRIGGER IF EXISTS after_assistant_message ON chat_messages;
CREATE TRIGGER after_assistant_message
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION trigger_continuous_learner();