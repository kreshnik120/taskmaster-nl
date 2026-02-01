-- Unique index op org_id + contact_id
-- Zorgt ervoor dat er maar 1 chat per contact per organisatie kan bestaan
CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_org_contact_unique 
ON whatsapp_chats (org_id, contact_id) 
WHERE deleted_at IS NULL AND contact_id IS NOT NULL;