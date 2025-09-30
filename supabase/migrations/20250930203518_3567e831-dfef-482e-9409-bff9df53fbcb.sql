-- Create chat messages table for AI assistant
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Users can view their own messages
CREATE POLICY "Users can view their own chat messages"
ON public.chat_messages FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own messages  
CREATE POLICY "Users can create their own chat messages"
ON public.chat_messages FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Index for performance
CREATE INDEX idx_chat_messages_user_id ON public.chat_messages(user_id, created_at DESC);