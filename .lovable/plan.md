
# WhatsApp Bridge Implementatie Plan

## Overzicht

Dit plan implementeert een complete WhatsApp integratie met:
- 4 database tabellen voor sessions, contacts, chats en messages
- Multi-tenant architectuur met org_id scoping
- RLS policies voor data isolatie
- Realtime voor berichten en chats
- Een beveiligde Edge Function als proxy voor de VPS

---

## DEEL 1: Database Schema

### 1.1 Tabellen Structuur

```text
+-------------------+     +--------------------+
| whatsapp_sessions |     | whatsapp_contacts  |
|-------------------|     |--------------------|
| id (PK)           |<----| session_id (FK)    |
| org_id (FK)       |     | org_id (FK)        |
| phone_number      |     | phone_number       |
| session_status    |     | display_name       |
| session_data      |     | professional_id(FK)|
| created_at        |     +--------------------+
| updated_at        |              |
+-------------------+              |
                                   v
+-------------------+     +-------------------+
| whatsapp_chats    |     | whatsapp_messages |
|-------------------|     |-------------------|
| id (PK)           |<----| chat_id (FK)      |
| session_id (FK)   |     | org_id (FK)       |
| contact_id (FK)   |     | message_id        |
| org_id (FK)       |     | message_type      |
| chat_jid (UNIQUE) |     | message_body      |
| chat_type         |     | sender_type       |
| unread_count      |     | sender_phone      |
| last_message_at   |     | sent_at           |
| last_message_prev |     | status            |
+-------------------+     +-------------------+
```

### 1.2 SQL Migratie

De volgende tabellen worden aangemaakt:

**whatsapp_sessions**
- Houdt WhatsApp sessie status bij per organisatie
- Linked aan organizations tabel
- Slaat QR code/session data op in JSONB

**whatsapp_contacts**
- WhatsApp contacten per sessie
- Optionele koppeling naar professionals tabel voor matching
- Uniek per phone_number + session_id

**whatsapp_chats**
- Chat threads met contacten
- Unique constraint op chat_jid (WhatsApp chat identifier)
- Tracks unread count en laatste bericht preview

**whatsapp_messages**
- Alle berichten (inkomend en uitgaand)
- Unique constraint op message_id (WhatsApp message ID)
- Status tracking: received, delivered, read, failed

### 1.3 RLS Policies

Elke tabel krijgt dezelfde policy structuur:
- **SELECT**: Alleen records met matching org_id via user_organizations
- **INSERT/UPDATE/DELETE**: Zelfde org_id check

Security definer functie `get_user_org_id()` voorkomt recursieve RLS.

### 1.4 Realtime

Realtime wordt enabled op:
- `whatsapp_messages` - Voor live bericht updates
- `whatsapp_chats` - Voor unread count en last message updates

---

## DEEL 2: Edge Function `whatsapp-bridge`

### 2.1 Architectuur

```text
┌─────────────┐    HTTPS + X-API-Key    ┌─────────────────┐
│   VPS       │ ────────────────────────>│ whatsapp-bridge │
│ (Baileys)   │                          │ Edge Function   │
│ 72.x.x.x    │ <────────────────────────│                 │
└─────────────┘    JSON Response         └────────┬────────┘
                                                  │
                                                  │ SUPABASE_SERVICE_ROLE_KEY
                                                  │ (intern)
                                                  v
                                         ┌───────────────┐
                                         │   Database    │
                                         │ (whatsapp_*)  │
                                         └───────────────┘
```

### 2.2 Authenticatie

De functie valideert requests via:
1. **X-API-Key header** - Moet matchen met `CITOZORG_API_KEY` secret
2. **Request body validatie** - Verplichte velden per event type
3. **org_id validatie** - Moet bestaan in organizations tabel

### 2.3 Event Types

| Event | Actie |
|-------|-------|
| `message.received` | Insert message, update chat, auto-create contact/chat |
| `message.sent` | Insert message, update chat |
| `session.connected` | Update session status = 'connected' |
| `session.disconnected` | Update session status = 'disconnected' |
| `session.qr` | Update session met QR data |

### 2.4 Auto-Create Logic

Bij `message.received`:
1. Check of contact bestaat voor phone_number + session_id
2. Zo niet: maak contact aan met display_name uit fromName
3. Check of chat bestaat voor chat_jid + session_id
4. Zo niet: maak chat aan met contact_id
5. Insert message
6. Update chat.last_message_at en chat.last_message_preview

### 2.5 Request/Response Format

**Request:**
```json
{
  "event": "message.received",
  "sessionId": "uuid",
  "orgId": "uuid",
  "data": {
    "messageId": "3EB0ABC...",
    "chatJid": "31612345678@s.whatsapp.net",
    "from": "31612345678",
    "fromName": "Contact Naam",
    "body": "Hallo!",
    "timestamp": 1706450000000,
    "type": "text"
  }
}
```

**Response (success):**
```json
{
  "success": true,
  "messageId": "uuid",
  "contactId": "uuid",
  "chatId": "uuid"
}
```

**Response (error):**
```json
{
  "success": false,
  "error": "Invalid API key"
}
```

---

## DEEL 3: Implementatie Details

### 3.1 Bestanden

| Bestand | Doel |
|---------|------|
| `supabase/functions/whatsapp-bridge/index.ts` | Edge Function code |
| `supabase/config.toml` | Toevoegen functie config |

### 3.2 Config.toml Entry

```toml
[functions.whatsapp-bridge]
verify_jwt = false
# Purpose: WhatsApp Bridge proxy voor VPS communicatie
# Auth: API key via X-API-Key header (CITOZORG_API_KEY)
```

### 3.3 CORS Headers

Extended headers voor VPS communicatie:
- `x-api-key` toegevoegd aan allowed headers

---

## DEEL 4: VPS Configuratie

### 4.1 Edge Function URL

```
https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/whatsapp-bridge
```

### 4.2 Authenticatie

Header: `X-API-Key: [CITOZORG_API_KEY waarde]`

### 4.3 Test Command

```bash
curl -X POST \
  "https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/whatsapp-bridge" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_CITOZORG_API_KEY" \
  -d '{
    "event": "session.connected",
    "sessionId": "test-session-id",
    "orgId": "550e8400-e29b-41d4-a716-446655440000",
    "data": {
      "phoneNumber": "+31612345678"
    }
  }'
```

---

## Technische Details

### Database Migratie SQL

```sql
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
CREATE INDEX idx_whatsapp_contacts_session ON whatsapp_contacts(session_id);
CREATE INDEX idx_whatsapp_chats_session ON whatsapp_chats(session_id);
CREATE INDEX idx_whatsapp_messages_chat ON whatsapp_messages(chat_id);
CREATE INDEX idx_whatsapp_messages_sent_at ON whatsapp_messages(sent_at DESC);

-- 6. Enable RLS
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- 7. Security definer function
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM user_organizations WHERE user_id = auth.uid() LIMIT 1
$$;

-- 8. RLS Policies (for each table)
-- Sessions
CREATE POLICY "Users can view own org sessions" ON whatsapp_sessions
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Service role full access sessions" ON whatsapp_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- Contacts
CREATE POLICY "Users can view own org contacts" ON whatsapp_contacts
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Service role full access contacts" ON whatsapp_contacts
  FOR ALL USING (auth.role() = 'service_role');

-- Chats
CREATE POLICY "Users can view own org chats" ON whatsapp_chats
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Service role full access chats" ON whatsapp_chats
  FOR ALL USING (auth.role() = 'service_role');

-- Messages
CREATE POLICY "Users can view own org messages" ON whatsapp_messages
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Service role full access messages" ON whatsapp_messages
  FOR ALL USING (auth.role() = 'service_role');

-- 9. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_chats;
```

### Edge Function Code Structure

De Edge Function bevat:
1. **API Key validatie** - Check X-API-Key header tegen CITOZORG_API_KEY
2. **Event router** - Switch op event type
3. **Upsert helpers** - getOrCreateContact, getOrCreateChat
4. **Message handlers** - handleMessageReceived, handleMessageSent
5. **Session handlers** - handleSessionConnected, handleSessionDisconnected
6. **Logging** - Uitgebreide logging voor debugging

---

## Verificatie Checklist

Na implementatie:
- [ ] Tabellen aangemaakt met correcte foreign keys
- [ ] RLS policies actief op alle 4 tabellen
- [ ] Realtime enabled op messages en chats
- [ ] Edge Function deployed
- [ ] CITOZORG_API_KEY werkt voor authenticatie
- [ ] Test curl command succesvol
