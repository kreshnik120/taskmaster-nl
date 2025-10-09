-- ============================================
-- STAP 1: Verwijder oude/conflicterende trigger
-- ============================================
-- Deze trigger gebruikte een fragiele query (NEW.id - 1) 
-- en overlapt met de bestaande auto_learn_from_chat trigger
DROP TRIGGER IF EXISTS after_chat_message_autonomous_learning ON chat_messages;
DROP FUNCTION IF EXISTS trigger_continuous_learner();

-- ============================================
-- STAP 2: Fix RLS policy voor service_role
-- ============================================
-- De oude policy blokkeerde service_role (edge functions)
-- waardoor assistant messages niet werden opgeslagen
DROP POLICY IF EXISTS "Users can create their own chat messages" ON public.chat_messages;

-- Nieuwe policy: sta zowel authenticated users als service_role toe
CREATE POLICY "Users and service can create chat messages"
ON public.chat_messages
FOR INSERT
TO authenticated, service_role
WITH CHECK (
  -- Authenticated users kunnen alleen hun eigen messages inserten
  (auth.role() = 'authenticated' AND auth.uid() = user_id)
  OR
  -- Service role (edge functions) mag alle messages inserten
  auth.role() = 'service_role'
);