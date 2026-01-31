

## Probleem: Berichten van Telefoon Verschijnen Aan Verkeerde Kant

### Analyse

Het probleem is geïdentificeerd: wanneer je een bericht stuurt vanaf je telefoon via WhatsApp, komt dit binnen via de `message.received` event in de whatsapp-bridge. De huidige code zet **altijd** `sender_type: "contact"` - ongeacht of het bericht van jou (de sessie-eigenaar) komt.

### Oorzaak

In `handleMessageReceived` (regel 300):

```typescript
sender_type: "contact",  // ← Altijd "contact", nooit "self"
```

De sessie heeft een opgeslagen `phone_number` (bijv. `31618710360`). Wanneer een bericht binnenkomt met `from: 31618710360`, is dit een bericht dat JIJ hebt gestuurd - maar het wordt als "contact" gemarkeerd.

### Oplossing

Vergelijk de `from` (afzender) met het sessie telefoonnummer. Als ze overeenkomen, is het een "self" bericht.

---

### Technische Wijziging

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

**Locatie:** `handleMessageReceived` functie (rond regel 275-305)

**Wijzigingen:**

1. Haal het sessie telefoonnummer op uit de session data
2. Normaliseer beide telefoonnummers voor vergelijking (verwijder `+` en voorloopnullen)
3. Vergelijk `from` met sessie telefoon
4. Zet `sender_type` op `"self"` als ze overeenkomen

```typescript
// Na session ophalen (regel 278):
const session = await getOrCreateSession(supabase, sessionId, orgId, requestId);

// NIEUW: Bepaal of dit bericht van de sessie-eigenaar komt
function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/^\+/, '').replace(/^0/, '');
}

const normalizedFrom = normalizePhone(from);
const normalizedSessionPhone = normalizePhone(session.phone_number);
const isFromSelf = normalizedFrom && normalizedSessionPhone && 
                   normalizedFrom === normalizedSessionPhone;

console.log(`[${requestId}] Message from ${from}, session phone: ${session.phone_number}, isFromSelf: ${isFromSelf}`);

// In de insert (regel 294-305):
const { data: message, error: messageError } = await supabase
  .from("whatsapp_messages")
  .insert({
    org_id: orgId,
    chat_id: chat.id,
    message_id: messageId,
    message_type: type || "text",
    message_body: effectiveBody,
    sender_type: isFromSelf ? "self" : "contact",  // ← GEWIJZIGD
    sender_phone: from,
    sent_at: new Date(timestamp).toISOString(),
    status: isFromSelf ? "sent" : "received",      // ← GEWIJZIGD
  })
  .select("id")
  .single();
```

---

### Aanvullende Wijziging: Unread Count

Berichten die je zelf stuurt moeten de `unread_count` NIET verhogen:

```typescript
// Rond regel 367-374
if (!isFromSelf) {
  await supabase
    .from("whatsapp_chats")
    .update({
      last_message_at: new Date(timestamp).toISOString(),
      last_message_preview: effectiveBody.substring(0, 100) || '📷 Afbeelding',
      unread_count: chat.unread_count + 1,
    })
    .eq("id", chat.id);
} else {
  // Self-berichten: update alleen timestamp en preview, niet unread
  await supabase
    .from("whatsapp_chats")
    .update({
      last_message_at: new Date(timestamp).toISOString(),
      last_message_preview: effectiveBody.substring(0, 100) || '📷 Afbeelding',
    })
    .eq("id", chat.id);
}
```

---

### Bestaande Data Repareren (Optioneel)

Om bestaande foutief gemarkeerde berichten te corrigeren:

```sql
-- Update berichten die van de sessie-eigenaar kwamen
-- maar als "contact" zijn gemarkeerd
UPDATE whatsapp_messages m
SET sender_type = 'self',
    status = 'sent'
FROM whatsapp_chats c
JOIN whatsapp_sessions s ON c.session_id = s.id
WHERE m.chat_id = c.id
  AND m.sender_type = 'contact'
  AND m.sender_phone IS NOT NULL
  AND replace(replace(m.sender_phone, '+', ''), '0', '') = 
      replace(replace(s.phone_number, '+', ''), '0', '');
```

---

### Bestanden Overzicht

| Bestand | Wijzigingen |
|---------|-------------|
| `supabase/functions/whatsapp-bridge/index.ts` | + `normalizePhone` functie, + `isFromSelf` check, + dynamische `sender_type` |

---

### Visueel Resultaat Na Fix

```text
VOOR (huidige situatie):
┌─────────────────────────────────────┐
│ "Test" ← links (fout!)              │
│                         12:24       │
├─────────────────────────────────────┤
│                         "test" →    │ ← rechts (goed)
│                           13:29 ✓   │
├─────────────────────────────────────┤
│ "test" ← links (fout!)              │
│                         13:30       │
└─────────────────────────────────────┘

NA (gefixte situatie):
┌─────────────────────────────────────┐
│                          "Test" →   │ ← rechts (goed!)
│                           12:24 ✓   │
├─────────────────────────────────────┤
│                         "test" →    │ ← rechts (goed)
│                           13:29 ✓   │
├─────────────────────────────────────┤
│                          "test" →   │ ← rechts (goed!)
│                           13:30 ✓   │
└─────────────────────────────────────┘
```

---

### Test Checklist

- [ ] Stuur een bericht vanaf je telefoon via WhatsApp
- [ ] Controleer of het bericht aan de rechterkant verschijnt in ABCito.io
- [ ] Controleer of het bericht een verzonden status (✓) heeft
- [ ] Controleer of de unread_count NIET verhoogd wordt voor eigen berichten
- [ ] Controleer dat berichten van anderen nog steeds links verschijnen

