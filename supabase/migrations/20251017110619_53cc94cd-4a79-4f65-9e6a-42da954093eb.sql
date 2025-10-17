-- P1 STAP 3: Create missing database tables for AI chat functionality

-- 1. ai_chat_messages table (Chat geschiedenis)
CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  message_id uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  used_knowledge jsonb DEFAULT '[]'::jsonb,
  confidence_score numeric(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies: Users can only see/create their own messages
CREATE POLICY "Users can view their own chat messages"
  ON public.ai_chat_messages
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own chat messages"
  ON public.ai_chat_messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_id = auth.uid() AND org_id = ai_chat_messages.org_id
  ));

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_user_id ON public.ai_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_message_id ON public.ai_chat_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_created_at ON public.ai_chat_messages(created_at DESC);

-- 2. ai_chat_feedback table (Thumbs up/down feedback)
CREATE TABLE IF NOT EXISTS public.ai_chat_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_type text NOT NULL CHECK (feedback_type IN ('positive', 'negative')),
  knowledge_ids uuid[] DEFAULT ARRAY[]::uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Enable RLS
ALTER TABLE public.ai_chat_feedback ENABLE ROW LEVEL SECURITY;

-- RLS policies: Users can only see/create their own feedback
CREATE POLICY "Users can view their own feedback"
  ON public.ai_chat_feedback
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own feedback"
  ON public.ai_chat_feedback
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_ai_chat_feedback_message_id ON public.ai_chat_feedback(message_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_feedback_user_id ON public.ai_chat_feedback(user_id);

-- 3. chat_messages - backwards compatibility
-- If chat_messages exists as a table, rename it first
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER TABLE public.chat_messages RENAME TO chat_messages_old_backup;
  END IF;
END $$;

-- Now create view
CREATE OR REPLACE VIEW public.chat_messages AS
SELECT 
  id,
  user_id,
  org_id,
  message_id,
  role,
  content,
  used_knowledge,
  confidence_score,
  created_at
FROM public.ai_chat_messages;