-- =====================================================
-- WhatsApp Bridge Database Schema
-- 4 tables: sessions, contacts, chats, messages
-- Multi-tenant with org_id, RLS enabled, Realtime
-- =====================================================

-- 1. Sessions table
CREATE TABLE whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  session_status TEXT DEFAULT 'disconnected',
  session_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, phone_number)
);

-- 2. Contacts table
CREATE TABLE whatsapp_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  display_name TEXT,
  professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, phone_number)
);

-- 3. Chats table
CREATE TABLE whatsapp_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,
  chat_jid TEXT NOT NULL,
  chat_type TEXT DEFAULT 'direct',
  unread_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, chat_jid)
);

-- 4. Messages table
CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL REFERENCES whatsapp_chats(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  message_body TEXT,
  sender_type TEXT DEFAULT 'contact',
  sender_phone TEXT,
  sent_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'received',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(chat_id, message_id)
);

-- 5. Indexes for performance
CREATE INDEX idx_whatsapp_sessions_org ON whatsapp_sessions(org_id);
CREATE INDEX idx_whatsapp_sessions_status ON whatsapp_sessions(session_status);
CREATE INDEX idx_whatsapp_contacts_session ON whatsapp_contacts(session_id);
CREATE INDEX idx_whatsapp_contacts_phone ON whatsapp_contacts(phone_number);
CREATE INDEX idx_whatsapp_contacts_professional ON whatsapp_contacts(professional_id);
CREATE INDEX idx_whatsapp_chats_session ON whatsapp_chats(session_id);
CREATE INDEX idx_whatsapp_chats_contact ON whatsapp_chats(contact_id);
CREATE INDEX idx_whatsapp_chats_jid ON whatsapp_chats(chat_jid);
CREATE INDEX idx_whatsapp_messages_chat ON whatsapp_messages(chat_id);
CREATE INDEX idx_whatsapp_messages_sent_at ON whatsapp_messages(sent_at DESC);
CREATE INDEX idx_whatsapp_messages_status ON whatsapp_messages(status);

-- 6. Enable RLS
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- 7. Security definer function (avoid RLS recursion)
CREATE OR REPLACE FUNCTION get_user_whatsapp_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM user_organizations WHERE user_id = auth.uid() LIMIT 1
$$;

-- 8. RLS Policies for whatsapp_sessions
CREATE POLICY "Users can view own org sessions" ON whatsapp_sessions
  FOR SELECT USING (org_id = get_user_whatsapp_org_id());
CREATE POLICY "Users can insert own org sessions" ON whatsapp_sessions
  FOR INSERT WITH CHECK (org_id = get_user_whatsapp_org_id());
CREATE POLICY "Users can update own org sessions" ON whatsapp_sessions
  FOR UPDATE USING (org_id = get_user_whatsapp_org_id());
CREATE POLICY "Service role full access sessions" ON whatsapp_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- 9. RLS Policies for whatsapp_contacts
CREATE POLICY "Users can view own org contacts" ON whatsapp_contacts
  FOR SELECT USING (org_id = get_user_whatsapp_org_id());
CREATE POLICY "Users can insert own org contacts" ON whatsapp_contacts
  FOR INSERT WITH CHECK (org_id = get_user_whatsapp_org_id());
CREATE POLICY "Users can update own org contacts" ON whatsapp_contacts
  FOR UPDATE USING (org_id = get_user_whatsapp_org_id());
CREATE POLICY "Service role full access contacts" ON whatsapp_contacts
  FOR ALL USING (auth.role() = 'service_role');

-- 10. RLS Policies for whatsapp_chats
CREATE POLICY "Users can view own org chats" ON whatsapp_chats
  FOR SELECT USING (org_id = get_user_whatsapp_org_id());
CREATE POLICY "Users can insert own org chats" ON whatsapp_chats
  FOR INSERT WITH CHECK (org_id = get_user_whatsapp_org_id());
CREATE POLICY "Users can update own org chats" ON whatsapp_chats
  FOR UPDATE USING (org_id = get_user_whatsapp_org_id());
CREATE POLICY "Service role full access chats" ON whatsapp_chats
  FOR ALL USING (auth.role() = 'service_role');

-- 11. RLS Policies for whatsapp_messages
CREATE POLICY "Users can view own org messages" ON whatsapp_messages
  FOR SELECT USING (org_id = get_user_whatsapp_org_id());
CREATE POLICY "Users can insert own org messages" ON whatsapp_messages
  FOR INSERT WITH CHECK (org_id = get_user_whatsapp_org_id());
CREATE POLICY "Service role full access messages" ON whatsapp_messages
  FOR ALL USING (auth.role() = 'service_role');

-- 12. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_chats;

-- 13. Updated_at trigger function (reuse if exists)
CREATE OR REPLACE FUNCTION update_whatsapp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 14. Apply updated_at triggers
CREATE TRIGGER set_whatsapp_sessions_updated_at
  BEFORE UPDATE ON whatsapp_sessions
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();

CREATE TRIGGER set_whatsapp_contacts_updated_at
  BEFORE UPDATE ON whatsapp_contacts
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();

CREATE TRIGGER set_whatsapp_chats_updated_at
  BEFORE UPDATE ON whatsapp_chats
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();