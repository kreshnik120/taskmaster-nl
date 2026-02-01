

# WhatsApp Chat Duplicaten - Merge Plan

## 📊 Geverifieerde Situatie

### Probleem Geïdentificeerd

| Contact | Duplicate Chats | Sessies | Totaal Berichten |
|---------|-----------------|---------|------------------|
| Kreshnik | 3 | 3 verschillende | 45 |

### Root Cause

De `getOrCreateChat` functie zoekt op `session_id + contact_id`:

```text
Huidige lookup (regel 1422-1428):
  .eq("session_id", sessionId)  ← Elke sessie krijgt eigen chat
  .eq("contact_id", contactId)
```

Dit veroorzaakt duplicate chats wanneer:
1. WhatsApp opnieuw wordt verbonden (nieuwe sessie)
2. Berichten van hetzelfde contact komen in nieuwe sessie

### Sessie Overzicht

| Sessie ID | Status | Chats | Laatste Bericht |
|-----------|--------|-------|-----------------|
| `61f4b1fb-5bcf...` | **ACTIEF** | 65 | 2026-02-01 19:51 |
| `9a8c604c-4237...` | Oud | 1 | 2026-01-29 08:17 |
| `999a8fdb-7a36...` | Oud | 3 | 1970 (corrupt) |

---

## 🔧 Oplossing

### Stap 1: Database Cleanup - Merge Kreshnik Chats

```sql
-- Kreshnik heeft 3 chats, we behouden de actieve (meeste berichten + nieuwste)
-- Chat IDs:
-- 4c9a25f0... = 32 berichten (BEHOUDEN - actieve sessie)
-- a1cd195d... = 10 berichten (MERGE)
-- f46d3fa3... = 3 berichten (MERGE)

-- 1A: Verplaats alle berichten naar de primaire chat
UPDATE whatsapp_messages 
SET chat_id = '4c9a25f0-f1a2-4957-a09d-b4e03ee2a1da'
WHERE chat_id IN (
  'a1cd195d-7894-49b3-98aa-a66626a53620',
  'f46d3fa3-d560-4412-a110-94ac23f64d37'
);

-- 1B: Update unread_count door som te nemen
UPDATE whatsapp_chats 
SET unread_count = (
  SELECT COALESCE(SUM(unread_count), 0)
  FROM whatsapp_chats 
  WHERE contact_id = '9f68dd01-0bfc-4eb4-bd0e-cdd5b79eae03'
)
WHERE id = '4c9a25f0-f1a2-4957-a09d-b4e03ee2a1da';

-- 1C: Verwijder de lege duplicate chats
DELETE FROM whatsapp_chats 
WHERE id IN (
  'a1cd195d-7894-49b3-98aa-a66626a53620',
  'f46d3fa3-d560-4412-a110-94ac23f64d37'
);
```

### Stap 2: Code Fix - Lookup op org_id (niet session_id)

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

Wijzig `getOrCreateChat` (regel 1419-1428):

```typescript
// VOOR (veroorzaakt duplicaten):
const { data: existingByContact } = await supabase
  .from("whatsapp_chats")
  .select("id, unread_count, chat_jid")
  .eq("session_id", sessionId)  // ❌ Elke sessie = nieuwe chat
  .eq("contact_id", contactId)
  .is("deleted_at", null)
  .maybeSingle();

// NA (voorkomt duplicaten):
const { data: existingByContact } = await supabase
  .from("whatsapp_chats")
  .select("id, unread_count, chat_jid, session_id")
  .eq("org_id", orgId)  // ✅ Zoek binnen hele organisatie
  .eq("contact_id", contactId)
  .is("deleted_at", null)
  .maybeSingle();

if (existingByContact) {
  // Update session_id naar huidige sessie (voor realtime sync)
  if (existingByContact.session_id !== sessionId) {
    console.log(`[${requestId}] Migrating chat to new session`);
    await supabase
      .from("whatsapp_chats")
      .update({ session_id: sessionId })
      .eq("id", existingByContact.id);
  }
  // ... rest van de logica
}
```

### Stap 3: Database Constraint - Voorkom Toekomstige Duplicaten

```sql
-- Unique index op org_id + contact_id
-- Zorgt ervoor dat er maar 1 chat per contact per organisatie kan bestaan
CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_org_contact_unique 
ON whatsapp_chats (org_id, contact_id) 
WHERE deleted_at IS NULL;
```

---

## Implementatievolgorde

| # | Actie | Type | Impact |
|---|-------|------|--------|
| 1 | Merge Kreshnik berichten naar 1 chat | SQL | 45 berichten → 1 chat |
| 2 | Verwijder 2 lege duplicate chats | SQL | -2 chats |
| 3 | Update `getOrCreateChat` naar org_id lookup | Code | Preventief |
| 4 | Voeg UNIQUE INDEX toe | Schema | Garantie |
| 5 | Deploy Edge Function | Deploy | Activeer |

---

## Technische Details

### Stap 2: Volledige getOrCreateChat Update

Locatie: `supabase/functions/whatsapp-bridge/index.ts` regel 1410-1472

```typescript
async function getOrCreateChat(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  chatJid: string,
  contactId: string,
  isGroupChat: boolean,
  requestId: string
) {
  // VERBETERD: Zoek op org_id + contact_id (niet session_id)
  // Dit voorkomt duplicate chats bij sessie-wissels
  const { data: existingByContact } = await supabase
    .from("whatsapp_chats")
    .select("id, unread_count, chat_jid, session_id")
    .eq("org_id", orgId)  // ✅ Organisatie-breed zoeken
    .eq("contact_id", contactId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingByContact) {
    let needsUpdate = false;
    const updates: Record<string, string> = {};

    // Migreer naar huidige sessie als nodig
    if (existingByContact.session_id !== sessionId) {
      console.log(`[${requestId}] ⚡ Migrating chat from session ${existingByContact.session_id} to ${sessionId}`);
      updates.session_id = sessionId;
      needsUpdate = true;
    }

    // Update chat_jid als het verandert (bijv. LID → JID)
    if (existingByContact.chat_jid !== chatJid) {
      console.log(`[${requestId}] ⚡ Updating chat_jid from ${existingByContact.chat_jid} to ${chatJid}`);
      updates.chat_jid = chatJid;
      needsUpdate = true;
    }

    if (needsUpdate) {
      await supabase
        .from("whatsapp_chats")
        .update(updates)
        .eq("id", existingByContact.id);
    }

    return existingByContact;
  }

  // Fallback: zoek op exacte JID binnen org (voor groepschats of chats zonder contact)
  const { data: existingByJid } = await supabase
    .from("whatsapp_chats")
    .select("id, unread_count, session_id")
    .eq("org_id", orgId)  // ✅ Ook hier org_id gebruiken
    .eq("chat_jid", chatJid)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingByJid) {
    // Migreer naar huidige sessie
    if (existingByJid.session_id !== sessionId) {
      await supabase
        .from("whatsapp_chats")
        .update({ session_id: sessionId })
        .eq("id", existingByJid.id);
    }
    return existingByJid;
  }

  // Nieuwe chat aanmaken
  console.log(`[${requestId}] Creating new ${isGroupChat ? 'group' : 'direct'} chat: ${chatJid}`);
  const { data: newChat, error } = await supabase
    .from("whatsapp_chats")
    .insert({
      org_id: orgId,
      session_id: sessionId,
      contact_id: contactId,
      chat_jid: chatJid,
      chat_type: isGroupChat ? "group" : "direct",
      unread_count: 0,
    })
    .select("id, unread_count")
    .single();

  if (error) {
    throw new Error(`Chat creation failed: ${formatError(error)}`);
  }
  return newChat;
}
```

---

## Verwacht Resultaat

### Voor:
- Kreshnik: 3 chats met 32 + 10 + 3 berichten verspreid
- UI toont 3x dezelfde persoon

### Na:
- Kreshnik: 1 chat met alle 45 berichten
- UI toont 1x Kreshnik met complete geschiedenis
- Nieuwe sessies hergebruiken bestaande chat

---

## Verificatie

```sql
-- Test 1: Kreshnik heeft 1 chat
SELECT COUNT(*) FROM whatsapp_chats ch
JOIN whatsapp_contacts c ON ch.contact_id = c.id
WHERE c.display_name = 'Kreshnik';
-- Verwacht: 1

-- Test 2: Alle 45 berichten in die chat
SELECT COUNT(*) FROM whatsapp_messages m
JOIN whatsapp_chats ch ON m.chat_id = ch.id
JOIN whatsapp_contacts c ON ch.contact_id = c.id
WHERE c.display_name = 'Kreshnik';
-- Verwacht: 45

-- Test 3: Geen duplicate chats per contact
SELECT contact_id, COUNT(*) 
FROM whatsapp_chats 
WHERE deleted_at IS NULL 
GROUP BY contact_id 
HAVING COUNT(*) > 1;
-- Verwacht: 0 rijen
```

