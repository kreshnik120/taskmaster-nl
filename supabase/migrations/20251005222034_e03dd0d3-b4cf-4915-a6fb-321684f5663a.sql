-- Add metadata column to chat_messages for storing feedback context
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add index for better query performance on metadata
CREATE INDEX IF NOT EXISTS idx_chat_messages_metadata ON public.chat_messages USING gin(metadata);