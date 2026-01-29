-- Add new columns to whatsapp_contacts for tags and notes
ALTER TABLE whatsapp_contacts 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS contact_notes TEXT,
ADD COLUMN IF NOT EXISTS is_business_account BOOLEAN DEFAULT false;

-- Add chat state columns to whatsapp_chats
ALTER TABLE whatsapp_chats
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;