-- Add conversation_id column to chat_messages table for session-based chat
ALTER TABLE public.chat_messages 
ADD COLUMN conversation_id uuid;

-- Add index for better query performance on conversation_id
CREATE INDEX idx_chat_messages_conversation_id 
ON public.chat_messages(conversation_id);

-- Add composite index for user_id + conversation_id queries
CREATE INDEX idx_chat_messages_user_conversation 
ON public.chat_messages(user_id, conversation_id);