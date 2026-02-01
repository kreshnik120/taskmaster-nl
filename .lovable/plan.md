
# WhatsApp Groepsleden Module - Implementatieplan

## Huidige Situatie Analyse

### Wat werkt:
| Component | Status | Detail |
|-----------|--------|--------|
| Groepschat herkenning | ✅ | `chat_type === 'group'` en `@g.us` detectie |
| Afzendernamen in berichten | ✅ | `sender_jid` + `sender_name` in `whatsapp_messages` |
| Groepsicoon in chatlijst | ✅ | `<Users>` icoon via `WhatsAppContactAvatar` |
| Profielpaneel | ⚠️ | Toont 1 "contact" voor groepen, geen ledenlijst |

### Gevonden Groepsdata:

| Groep | Unieke Afzenders | Berichten |
|-------|------------------|-----------|
| Shkelzen | 3 (🙏, K, .) | 11 |
| Simon de Jong | 1 | 10 |
| Sarah | 0 (geen sender_jid) | 3 |
| abczorg | 0 (geen sender_jid) | 10 |

### Observaties:
1. Oudere berichten missen `sender_jid`/`sender_name` (legacy data)
2. Nieuwe berichten van VPS hebben correcte sender info
3. Groepen worden als "contact" opgeslagen in `whatsapp_contacts` met `group-{jid}` als phone_number

---

## Oplossing in 6 Stappen

### Stap 1: Database Schema - Groepsleden Tabel

Maak een nieuwe tabel `whatsapp_group_members` om groepsdeelnemers te tracken:

```text
whatsapp_group_members
├── id (UUID, PK)
├── chat_id (UUID, FK → whatsapp_chats)
├── member_jid (TEXT)           -- WhatsApp ID van lid
├── display_name (TEXT)         -- Naam uit berichten
├── contact_id (UUID, nullable) -- Link naar bestaand contact
├── role (TEXT)                 -- 'member' | 'admin' | 'superadmin'
├── is_self (BOOLEAN)           -- Eigen account markering
├── joined_at (TIMESTAMPTZ)
├── left_at (TIMESTAMPTZ)       -- NULL = actief lid
├── created_at (TIMESTAMPTZ)
├── updated_at (TIMESTAMPTZ)
└── UNIQUE(chat_id, member_jid)
```

RLS: Toegang via organisatie-lidmaatschap, identiek aan `whatsapp_chats`.

### Stap 2: Backfill - Historische Leden Extraheren

SQL-script om bestaande afzenders uit `whatsapp_messages` te extraheren:

```text
Bron: whatsapp_messages WHERE chat_type = 'group' AND sender_jid IS NOT NULL
Actie: INSERT INTO whatsapp_group_members met DISTINCT (chat_id, sender_jid)
Resultaat: Automatisch alle bekende groepsleden vullen
```

### Stap 3: Edge Function Update - Auto-registratie

Bij elk inkomend groepsbericht: controleer of afzender al geregistreerd staat.

```text
Locatie: whatsapp-bridge/index.ts → handleMessageReceived()
Trigger: isGroupChat && sender_jid aanwezig
Actie: upsertGroupMember(chatId, senderJid, senderName)
```

Logica:
- Zoek bestaand lid op `chat_id + member_jid`
- Update `display_name` als deze verandert (push_name update)
- Voeg toe als lid niet bestaat

### Stap 4: React Hook - Ledenlijst Ophalen

Nieuwe hook `useWhatsAppGroupMembers`:

```text
Query: SELECT * FROM whatsapp_group_members WHERE chat_id = ? ORDER BY display_name
Realtime: Subscribe op INSERT/UPDATE voor live updates
Cache: 30 seconden stale time
```

### Stap 5: UI Component - Groepsprofiel

Nieuw component `WhatsAppGroupProfile` als alternatief voor `WhatsAppContactProfile`:

```text
┌────────────────────────────┐
│ Groepsinfo               X │
├────────────────────────────┤
│         [Groep Icon]       │
│        "Shkelzen"          │
│       3 deelnemers         │
├────────────────────────────┤
│ DEELNEMERS                 │
│ ┌──────────────────────┐   │
│ │ [🙏] 🙏               │   │
│ │ [K ] K                │   │
│ │ [. ] .                │   │
│ └──────────────────────┘   │
├────────────────────────────┤
│ ACTIES                     │
│ [📌 Pin groep           ]  │
│ [🔇 Mute groep          ]  │
│ [📁 Archiveer           ]  │
└────────────────────────────┘
```

Features:
- Ledenlijst met avatars (initials fallback)
- Aantal deelnemers
- Zelfde acties als contactprofiel (pin/mute/archive)

### Stap 6: Profiel Switcher

Update `WhatsApp.tsx` om het juiste profiel te tonen:

```text
if (selectedChat.chat_type === 'group') {
  render <WhatsAppGroupProfile />
} else {
  render <WhatsAppContactProfile />
}
```

---

## Bestandswijzigingen

| Bestand | Actie | Omschrijving |
|---------|-------|--------------|
| `migrations/xxx_group_members.sql` | Nieuw | Tabel + RLS + Backfill |
| `supabase/functions/whatsapp-bridge/index.ts` | Update | `upsertGroupMember()` functie |
| `src/types/whatsapp.ts` | Update | `WhatsAppGroupMember` interface |
| `src/hooks/whatsapp/useWhatsAppGroupMembers.ts` | Nieuw | Hook voor ledenlijst |
| `src/components/whatsapp/WhatsAppGroupProfile.tsx` | Nieuw | Groepsprofiel component |
| `src/pages/WhatsApp.tsx` | Update | Profiel switcher logica |

---

## Technische Details

### 1. Database Migratie

```sql
-- Tabel aanmaken
CREATE TABLE whatsapp_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES whatsapp_chats(id) ON DELETE CASCADE,
  member_jid TEXT NOT NULL,
  display_name TEXT,
  contact_id UUID REFERENCES whatsapp_contacts(id),
  role TEXT DEFAULT 'member' CHECK (role IN ('member', 'admin', 'superadmin')),
  is_self BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_chat_member UNIQUE(chat_id, member_jid)
);

-- Index voor snelle lookups
CREATE INDEX idx_group_members_chat ON whatsapp_group_members(chat_id);
CREATE INDEX idx_group_members_contact ON whatsapp_group_members(contact_id) WHERE contact_id IS NOT NULL;

-- RLS activeren
ALTER TABLE whatsapp_group_members ENABLE ROW LEVEL SECURITY;

-- Lees policy: via org toegang
CREATE POLICY "Users can view group members of their org"
ON whatsapp_group_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM whatsapp_chats ch
    JOIN user_organizations uo ON ch.org_id = uo.org_id
    WHERE ch.id = whatsapp_group_members.chat_id
    AND uo.user_id = auth.uid()
  )
);

-- Backfill bestaande data
INSERT INTO whatsapp_group_members (chat_id, member_jid, display_name, joined_at)
SELECT DISTINCT 
  m.chat_id,
  m.sender_jid,
  m.sender_name,
  MIN(m.sent_at)
FROM whatsapp_messages m
JOIN whatsapp_chats ch ON m.chat_id = ch.id
WHERE ch.chat_type = 'group'
  AND m.sender_jid IS NOT NULL
  AND m.sender_jid != ''
GROUP BY m.chat_id, m.sender_jid, m.sender_name
ON CONFLICT (chat_id, member_jid) DO NOTHING;

-- Realtime activeren
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_group_members;
```

### 2. Edge Function Update

```typescript
// Nieuwe helper functie
async function upsertGroupMember(
  supabase: SupabaseClientAny,
  chatId: string,
  memberJid: string,
  displayName: string | null,
  requestId: string
): Promise<void> {
  if (!memberJid) return;
  
  const { error } = await supabase
    .from("whatsapp_group_members")
    .upsert(
      {
        chat_id: chatId,
        member_jid: memberJid,
        display_name: displayName,
        updated_at: new Date().toISOString(),
      },
      { 
        onConflict: 'chat_id,member_jid',
        ignoreDuplicates: false 
      }
    );

  if (error) {
    console.error(`[${requestId}] Group member upsert failed:`, error);
  } else {
    console.log(`[${requestId}] ✅ Group member tracked: ${displayName || memberJid}`);
  }
}

// Aanroep in handleMessageReceived(), na message insert:
if (isGroupChat && effectiveFrom) {
  await upsertGroupMember(supabase, chat.id, effectiveFrom, effectiveFromName, requestId);
}
```

### 3. TypeScript Interface

```typescript
export interface WhatsAppGroupMember {
  id: string;
  chat_id: string;
  member_jid: string;
  display_name: string | null;
  contact_id: string | null;
  role: 'member' | 'admin' | 'superadmin';
  is_self: boolean;
  joined_at: string;
  left_at: string | null;
  created_at: string;
  updated_at: string;
  // Relaties
  contact?: WhatsAppContact | null;
}
```

### 4. React Hook

```typescript
export function useWhatsAppGroupMembers(chatId: string | undefined) {
  return useQuery({
    queryKey: ['whatsapp-group-members', chatId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_group_members')
        .select(`
          *,
          contact:whatsapp_contacts(id, display_name, profile_picture_url)
        `)
        .eq('chat_id', chatId)
        .is('left_at', null)
        .order('display_name', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!chatId,
    staleTime: 30000,
  });
}
```

---

## Verwacht Resultaat

### Voor:
- Groep "Shkelzen" toont 1 contact in profielpaneel
- Geen overzicht van wie er in de groep zitten
- Afzendernamen alleen zichtbaar in berichten

### Na:
- Groep "Shkelzen" toont 3 deelnemers: 🙏, K, .
- Elk nieuw groepsbericht voegt automatisch afzenders toe
- Profielpaneel past zich aan op basis van chat type
- Ledenlijst met avatars en namen

---

## Verificatie

```sql
-- Test 1: Leden correct geïmporteerd
SELECT gm.display_name, gm.member_jid, c.display_name as group_name
FROM whatsapp_group_members gm
JOIN whatsapp_chats ch ON gm.chat_id = ch.id
JOIN whatsapp_contacts c ON ch.contact_id = c.id
ORDER BY c.display_name, gm.display_name;

-- Test 2: Aantal leden per groep
SELECT c.display_name, COUNT(gm.id) as member_count
FROM whatsapp_chats ch
JOIN whatsapp_contacts c ON ch.contact_id = c.id
LEFT JOIN whatsapp_group_members gm ON ch.id = gm.chat_id
WHERE ch.chat_type = 'group'
GROUP BY c.display_name;
```

