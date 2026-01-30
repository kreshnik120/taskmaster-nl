-- Add whatsapp_jid column to whatsapp_contacts
ALTER TABLE public.whatsapp_contacts 
ADD COLUMN whatsapp_jid TEXT;

-- Create index for efficient lookups (used by group chat logic)
CREATE INDEX idx_whatsapp_contacts_jid_session 
ON public.whatsapp_contacts(session_id, whatsapp_jid);

-- Backfill existing contacts with JID based on phone_number
UPDATE public.whatsapp_contacts 
SET whatsapp_jid = phone_number || '@s.whatsapp.net'
WHERE whatsapp_jid IS NULL 
AND phone_number NOT LIKE 'group-%';

-- Backfill group contacts (phone_number starts with 'group-')
UPDATE public.whatsapp_contacts 
SET whatsapp_jid = REPLACE(phone_number, 'group-', '') || '@g.us'
WHERE whatsapp_jid IS NULL 
AND phone_number LIKE 'group-%';