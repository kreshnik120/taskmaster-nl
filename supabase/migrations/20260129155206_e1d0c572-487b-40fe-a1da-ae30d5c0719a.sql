-- Add deleted_at column to whatsapp_chats for soft delete functionality
ALTER TABLE whatsapp_chats 
ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;