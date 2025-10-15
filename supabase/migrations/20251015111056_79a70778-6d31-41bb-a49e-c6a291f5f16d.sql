-- ============================================
-- KRITIEKE FIX: Verwijder blokkerende triggers
-- ============================================
-- Deze triggers gebruiken net.http_post en blokkeren chat_messages inserts
-- waardoor messageId undefined blijft op de frontend

-- Drop de triggers (correcte namen)
DROP TRIGGER IF EXISTS after_assistant_message ON public.chat_messages;
DROP TRIGGER IF EXISTS auto_learn_from_chat ON public.chat_messages;

-- Drop ook de functies zelf (worden niet meer gebruikt)
DROP FUNCTION IF EXISTS public.trigger_continuous_learner();
DROP FUNCTION IF EXISTS public.trigger_meta_orchestrator();

-- Verificatie log
DO $$
BEGIN
  RAISE NOTICE '✅ Blokkerende triggers verwijderd - chat_messages inserts kunnen nu altijd slagen';
END $$;