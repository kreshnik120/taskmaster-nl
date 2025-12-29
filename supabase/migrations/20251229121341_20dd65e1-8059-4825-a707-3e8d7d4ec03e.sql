-- Drop the foreign key constraint that incorrectly points to chat_messages_old_backup
-- This allows message_feedback to store feedback for messages from any source
-- (ai_chat_messages, Fast Path generated IDs, etc.)

ALTER TABLE public.message_feedback 
DROP CONSTRAINT IF EXISTS message_feedback_message_id_fkey;

-- Add a comment explaining why there's no FK constraint
COMMENT ON COLUMN public.message_feedback.message_id IS 'References message ID from ai_chat_messages or Fast Path generated IDs. No FK constraint to allow flexibility for multiple message sources.';