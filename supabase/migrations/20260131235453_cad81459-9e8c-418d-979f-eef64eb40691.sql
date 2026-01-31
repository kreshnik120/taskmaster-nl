-- Fase 1: Groepsberichten afzender kolommen
ALTER TABLE whatsapp_messages 
ADD COLUMN IF NOT EXISTS sender_jid TEXT,
ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- Fase 2: Reply/Quote kolommen
ALTER TABLE whatsapp_messages 
ADD COLUMN IF NOT EXISTS quoted_message_id TEXT,
ADD COLUMN IF NOT EXISTS quoted_message_preview TEXT;

-- Indexes voor efficiënte queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sender_jid 
ON whatsapp_messages(sender_jid) 
WHERE sender_jid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_quoted 
ON whatsapp_messages(quoted_message_id) 
WHERE quoted_message_id IS NOT NULL;

-- Comments voor documentatie
COMMENT ON COLUMN whatsapp_messages.sender_jid IS 'WhatsApp JID van de afzender (relevant voor groepsberichten)';
COMMENT ON COLUMN whatsapp_messages.sender_name IS 'Display naam van de afzender op moment van verzending';
COMMENT ON COLUMN whatsapp_messages.quoted_message_id IS 'WhatsApp message ID van het geciteerde bericht';
COMMENT ON COLUMN whatsapp_messages.quoted_message_preview IS 'Preview (max 100 chars) van het geciteerde bericht';