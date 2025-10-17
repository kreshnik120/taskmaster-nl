-- Fix chat_messages compatibility: Add conversation_id and expose all needed fields

-- Add conversation_id to ai_chat_messages table
ALTER TABLE public.ai_chat_messages ADD COLUMN IF NOT EXISTS conversation_id uuid;

-- Create index for conversation_id
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_conversation_id ON public.ai_chat_messages(conversation_id);

-- Drop and recreate view with all fields including metadata compatibility
DROP VIEW IF EXISTS public.chat_messages;

CREATE OR REPLACE VIEW public.chat_messages AS
SELECT 
  id,
  user_id,
  org_id,
  message_id,
  conversation_id,
  role,
  content,
  used_knowledge,
  -- Create metadata field for backwards compatibility
  jsonb_build_object(
    'knowledge_ids_for_feedback', COALESCE(used_knowledge, '[]'::jsonb),
    'usedKnowledge', COALESCE(used_knowledge, '[]'::jsonb)
  ) as metadata,
  confidence_score,
  created_at
FROM public.ai_chat_messages;