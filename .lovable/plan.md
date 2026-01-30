
# Plan: Edge Function Groepen Fix - Implementatie

## Overzicht

Dit plan implementeert volledige groepsondersteuning in de `whatsapp-bridge` Edge Function.

## Bevestigd: useWhatsAppChats.ts ✅

De hook heeft **geen filter op `chat_type`** - alle chats (direct + groepen) worden al correct opgehaald. Geen wijziging nodig.

## Wijzigingen in supabase/functions/whatsapp-bridge/index.ts

### 1. handleMessageReceived (regel 203-234)

**Toevoegingen:**
- `isGroup` en `groupName` in destructuring
- Groepsdetectie: `isGroupChat = isGroup === true || chatJid.includes("@g.us")`
- Aparte contact-logica voor groepen vs direct messages
- Pass `isGroupChat` naar `getOrCreateChat`

```typescript
const { messageId, chatJid, from, fromName, body, timestamp, type, isGroup, groupName } = data as {
  // ... bestaande types
  isGroup?: boolean;
  groupName?: string;
};

const isGroupChat = isGroup === true || chatJid.includes("@g.us");

let contact;
if (isGroupChat) {
  contact = await getOrCreateGroupContact(supabase, session.id, orgId, chatJid, groupName || fromName, requestId);
} else {
  contact = await getOrCreateContact(supabase, session.id, orgId, from, fromName, requestId);
}

const chat = await getOrCreateChat(supabase, session.id, orgId, chatJid, contact.id, isGroupChat, requestId);
```

### 2. getOrCreateContact (regel 945-989)

**Toevoegingen:**
- `whatsapp_jid` bij nieuwe contacten: `${phoneNumber}@s.whatsapp.net`
- `push_name` veld voor originele WhatsApp naam
- Verbeterde update-logica (overschrijf geen bestaande naam)

### 3. Nieuwe functie: getOrCreateGroupContact

**Nieuw (na regel 989):**
- Zoekt op `whatsapp_jid` (niet phone_number)
- Maakt contact aan met:
  - `phone_number: "group-{groupId}"`
  - `whatsapp_jid: "{chatJid}"`
  - `display_name: groupName || "Groep {laatste 6 cijfers}"`
- Update groepsnaam indien VPS deze later stuurt

### 4. getOrCreateChat (regel 991-1028)

**Wijziging:**
- Nieuwe parameter: `isGroupChat: boolean`
- Expliciete `chat_type` toewijzing

## Data Flow na Fix

```text
VPS Groepsbericht:
{
  chatJid: "120363123456789012@g.us",
  from: "31612345678",
  isGroup: true,
  groupName: "Team ABCZorg"
}
        ↓
Edge Function: isGroupChat = true
        ↓
getOrCreateGroupContact():
  - Zoek op whatsapp_jid = "120363123456789012@g.us"
  - Maak contact: phone_number = "group-120363123456789012"
        ↓
getOrCreateChat():
  - chat_type = "group"
        ↓
UI: Groep met Users icoon ✅
```

## Bestanden Overzicht

| Bestand | Actie |
|---------|-------|
| `src/hooks/whatsapp/useWhatsAppChats.ts` | ✅ Geen wijziging nodig |
| `supabase/functions/whatsapp-bridge/index.ts` | EDIT - 3 locaties + 1 nieuwe functie |

## Verificatie

Na deployment:
1. Stuur bericht in een WhatsApp groep
2. Check Edge Function logs: "Creating group contact: ...@g.us"
3. Check database: `chat_type = "group"`, `phone_number = "group-..."`
4. Refresh `/whatsapp` - groep moet zichtbaar zijn met Users icoon
