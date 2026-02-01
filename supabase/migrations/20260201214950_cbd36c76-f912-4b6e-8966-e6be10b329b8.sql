-- 1. Nieuwe kolom toevoegen voor link naar privé chat
ALTER TABLE whatsapp_group_members
ADD COLUMN direct_chat_id UUID REFERENCES whatsapp_chats(id);

-- 2. Index voor snelle lookups
CREATE INDEX idx_group_members_direct_chat 
ON whatsapp_group_members(direct_chat_id) 
WHERE direct_chat_id IS NOT NULL;

-- 3. Backfill: link bestaande leden aan hun directe chats
-- Match op numerieke prefix van member_jid met phone_number van contacten
UPDATE whatsapp_group_members gm
SET direct_chat_id = matched.chat_id,
    contact_id = matched.contact_id
FROM (
  SELECT 
    ch.id as chat_id,
    ch.contact_id,
    c.phone_number as member_number,
    ch.org_id
  FROM whatsapp_chats ch
  JOIN whatsapp_contacts c ON ch.contact_id = c.id
  WHERE ch.chat_type = 'direct'
) matched
WHERE SPLIT_PART(gm.member_jid, '@', 1) = matched.member_number
  AND gm.direct_chat_id IS NULL;