

# WhatsApp Duplicatie & Profielfoto Problemen - Analyse & Oplossingsplan

## Geïdentificeerde Problemen

### Probleem 1: Dubbele chats door WhatsApp LID-formaat (KRITIEK)

**Oorzaak:** WhatsApp stuurt soms berichten met een **LID (Local ID)** formaat (`26873727819967@lid`) in plaats van het standaard telefoonnummer JID (`31686861816@s.whatsapp.net`). 

De `getOrCreateChat` functie in `whatsapp-bridge` zoekt op `chat_jid`, wat resulteert in twee aparte chats voor dezelfde persoon:

```text
Chat 1: chat_jid = "31686861816@s.whatsapp.net" (normaal formaat)
Chat 2: chat_jid = "26873727819967@lid"        (LID formaat)
Beide: contact_id = "af1e3d90-..." (BLOEZEM)
```

**Impact:** BLOEZEM verschijnt 2x in de chatlijst, zoals zichtbaar op je screenshot.

---

### Probleem 2: Ontbrekende profielfoto's

**Oorzaak:** Profielfoto's worden alleen opgehaald via het `contact.profilePicture` event of de `syncAllProfilePictures` batch-sync. Er is geen automatische trigger bij nieuwe contacten.

Contacten zonder foto (20+):
- Ismail, Jones, Simon de Jong, Sarah, N, +31613576869, etc.

---

## Technische Oplossing

### Oplossing 1: Chat-koppeling op basis van contact_id (niet chat_jid)

**Aanpak:** In `getOrCreateChat` eerst zoeken naar bestaande chat met dezelfde `contact_id`, ongeacht het JID-formaat.

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

**Huidige code (regel 1292-1309):**
```typescript
async function getOrCreateChat(...) {
  const { data: existing } = await supabase
    .from("whatsapp_chats")
    .select("id, unread_count")
    .eq("session_id", sessionId)
    .eq("chat_jid", chatJid)  // ❌ Alleen op JID
    .single();
  ...
}
```

**Nieuwe code:**
```typescript
async function getOrCreateChat(...) {
  // Stap 1: Zoek eerst op contact_id (voorkomt duplicaten)
  const { data: existingByContact } = await supabase
    .from("whatsapp_chats")
    .select("id, unread_count, chat_jid")
    .eq("session_id", sessionId)
    .eq("contact_id", contactId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingByContact) {
    // Update chat_jid als nodig (van LID naar s.whatsapp.net)
    if (existingByContact.chat_jid !== chatJid) {
      console.log(`[${requestId}] Updating chat_jid from ${existingByContact.chat_jid} to ${chatJid}`);
      // Optioneel: bewaar beide JIDs in een array-kolom
    }
    return existingByContact;
  }

  // Stap 2: Fallback op exacte JID match
  const { data: existingByJid } = await supabase
    .from("whatsapp_chats")
    .select("id, unread_count")
    .eq("session_id", sessionId)
    .eq("chat_jid", chatJid)
    .maybeSingle();

  if (existingByJid) return existingByJid;

  // Stap 3: Nieuwe chat aanmaken
  ...
}
```

---

### Oplossing 2: Database opschoning (eenmalige migratie)

Merge bestaande duplicate chats naar één per contact:

```sql
-- Identificeer duplicaten (meerdere chats per contact)
WITH duplicates AS (
  SELECT 
    contact_id,
    array_agg(id ORDER BY created_at ASC) as chat_ids,
    count(*) as cnt
  FROM whatsapp_chats
  WHERE contact_id IS NOT NULL
    AND deleted_at IS NULL
  GROUP BY contact_id
  HAVING count(*) > 1
)
-- Behoud oudste chat, markeer rest als deleted
UPDATE whatsapp_chats
SET deleted_at = now()
WHERE id IN (
  SELECT unnest(chat_ids[2:]) FROM duplicates
);
```

---

### Oplossing 3: Automatische profielfoto-sync bij nieuw contact

**Aanpak:** In `getOrCreateContact` een background-trigger toevoegen om profielfoto op te halen.

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

Na het aanmaken van een nieuw contact:
```typescript
// Na succesvolle contact insert:
if (newContact) {
  // Trigger async profile picture fetch (fire-and-forget)
  EdgeRuntime.waitUntil(
    fetchProfilePictureAsync(orgId, newContact.id, phoneNumber)
  );
}
```

---

## Implementatievolgorde

| Stap | Actie | Risico |
|------|-------|--------|
| 1 | Pas `getOrCreateChat` aan om eerst op `contact_id` te zoeken | Laag - backward compatible |
| 2 | Voer database-migratie uit om bestaande duplicaten te mergen | Medium - vereist backup |
| 3 | Voeg automatische profielfoto-sync toe bij nieuw contact | Laag |
| 4 | Test end-to-end met nieuwe berichten | - |

---

## Belangrijke Waarschuwingen

**Bestaande koppelingen worden NIET gebroken:**
- De oplossing voegt alleen een extra lookup toe op `contact_id`
- Bestaande chats behouden hun `id` en `chat_jid`
- Berichten blijven gekoppeld aan de juiste chat

**Rollback mogelijk:**
- Migratie markeert duplicaten als `deleted_at` (soft delete)
- Originele data blijft behouden

