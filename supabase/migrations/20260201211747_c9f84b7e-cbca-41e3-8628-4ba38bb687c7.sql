-- Tabel aanmaken voor groepsleden tracking
CREATE TABLE public.whatsapp_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.whatsapp_chats(id) ON DELETE CASCADE,
  member_jid TEXT NOT NULL,
  display_name TEXT,
  contact_id UUID REFERENCES public.whatsapp_contacts(id),
  role TEXT DEFAULT 'member' CHECK (role IN ('member', 'admin', 'superadmin')),
  is_self BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_chat_member UNIQUE(chat_id, member_jid)
);

-- Index voor snelle lookups
CREATE INDEX idx_group_members_chat ON public.whatsapp_group_members(chat_id);
CREATE INDEX idx_group_members_contact ON public.whatsapp_group_members(contact_id) WHERE contact_id IS NOT NULL;

-- RLS activeren
ALTER TABLE public.whatsapp_group_members ENABLE ROW LEVEL SECURITY;

-- Lees policy: via org toegang (zelfde patroon als whatsapp_chats)
CREATE POLICY "Users can view group members of their org"
ON public.whatsapp_group_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.whatsapp_chats ch
    JOIN public.user_organizations uo ON ch.org_id = uo.org_id
    WHERE ch.id = whatsapp_group_members.chat_id
    AND uo.user_id = auth.uid()
  )
);

-- Backfill bestaande groepsleden uit berichten
INSERT INTO public.whatsapp_group_members (chat_id, member_jid, display_name, joined_at)
SELECT DISTINCT 
  m.chat_id,
  m.sender_jid,
  m.sender_name,
  MIN(m.sent_at)
FROM public.whatsapp_messages m
JOIN public.whatsapp_chats ch ON m.chat_id = ch.id
WHERE ch.chat_type = 'group'
  AND m.sender_jid IS NOT NULL
  AND m.sender_jid != ''
GROUP BY m.chat_id, m.sender_jid, m.sender_name
ON CONFLICT (chat_id, member_jid) DO NOTHING;

-- Realtime activeren voor live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_group_members;