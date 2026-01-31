

## Fix: Dubbele Berichten bij Verzenden (2 Problemen)

### Analyse van de Screenshots

De gebruiker toonde duidelijk het probleem:
1. **"hallo"** verschijnt 1x RECHTS (correct - zelf verzonden via UI)
2. **"hallo"** verschijnt 1x LINKS (fout - komt terug via webhook als "contact" bericht)

Dit komt doordat het bericht **TWEE KEER** in de database wordt opgeslagen:
1. Door `handleSendMessage` (whatsapp-bridge) met `sender_type: "user"` + status: "sent"
2. Door `handleMessageReceived` (webhook) als echo-bericht met `sender_type: "contact"` (ondanks de `isFromSelf` check)

---

### Probleem 1: isFromSelf Detectie Faalt

De `isFromSelf` check vergelijkt `from` (afzender) met `session.phone_number`:
- Maar bij groepschats of wanneer WhatsApp het bericht teruggeeft als "van jou", is de `from` soms anders geformatteerd
- De normalisatie werkt niet correct bij alle formaten

Belangrijker nog: **berichten verstuurd via de UI hebben een ander patroon**:
- De afzender is **niet** het sessie-telefoonnummer
- De afzender is de **ontvanger** (want het is een echo van het verzonden bericht)

---

### Probleem 2: Dubbele Realtime + Optimistic Update

Flow:
1. UI maakt **optimistic message** (in React Query cache)
2. `handleSendMessage` slaat bericht op in DB
3. Realtime subscription detecteert INSERT → voegt **nog een keer** toe aan cache
4. Resultaat: 2x hetzelfde bericht tijdelijk zichtbaar

---

### Oplossingen

#### Fix 1: Deduplicatie in `handleMessageReceived`

In de whatsapp-bridge moet worden gecontroleerd of het bericht **recent al is verzonden via handleSendMessage**. Dit kan door:
- Check op `message_body` + `chat_id` + `sent_at` binnen 60 seconden
- Of: check of er al een bericht bestaat met dezelfde body in de afgelopen minuut voor deze chat

```typescript
// In handleMessageReceived, VOOR de insert:
const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
const { data: recentDuplicate } = await supabase
  .from("whatsapp_messages")
  .select("id")
  .eq("chat_id", chat.id)
  .eq("message_body", effectiveBody)
  .eq("sender_type", "user")  // Alleen check tegen UI-verzonden berichten
  .gte("sent_at", oneMinuteAgo)
  .single();

if (recentDuplicate) {
  console.log(`[${requestId}] Skipping duplicate echo message: ${messageId}`);
  return { messageId: null, chatId: chat.id, duplicate: true };
}
```

#### Fix 2: Realtime Deduplicatie in Frontend

In `useWhatsAppMessages.ts`, controleer of het nieuwe bericht al in de cache zit (voorkom dubbele optimistic messages):

```typescript
.on('postgres_changes', { ... }, (payload) => {
  queryClient.setQueryData<{ pages: PageResult[]; pageParams: number[] }>(
    ['whatsapp-messages', chatId],
    (old) => {
      if (!old) return old;
      
      const newMessage = payload.new as WhatsAppMessage;
      
      // Check of dit bericht al bestaat (voorkom dubbele toevoeging)
      const alreadyExists = old.pages.some(page => 
        page.messages.some(msg => 
          msg.id === newMessage.id || 
          msg.message_id === newMessage.message_id ||
          // Check optimistic messages (id begint met "optimistic_")
          (msg.id.startsWith('optimistic_') && 
           msg.message_body === newMessage.message_body &&
           msg.chat_id === newMessage.chat_id)
        )
      );
      
      if (alreadyExists) {
        console.log('[useWhatsAppMessages] Skipping duplicate message:', newMessage.id);
        return old;
      }
      
      // ... rest van de logica
    }
  );
})
```

#### Fix 3: Vervang Optimistic Message met Echte Data

Na realtime insert, vervang de optimistic message (met fake ID) door het echte database record:

```typescript
// In plaats van alleen toevoegen, vervang optimistic met echt bericht
if (alreadyExists) {
  // Vervang optimistic message met echte data
  const updatedPages = old.pages.map(page => ({
    ...page,
    messages: page.messages.map(msg => {
      if (msg.id.startsWith('optimistic_') && 
          msg.message_body === newMessage.message_body) {
        return newMessage; // Vervang met echte data
      }
      return msg;
    })
  }));
  return { ...old, pages: updatedPages };
}
```

---

### Bestanden te Wijzigen

| Bestand | Wijziging |
|---------|-----------|
| `supabase/functions/whatsapp-bridge/index.ts` | + Deduplicatie check in `handleMessageReceived` voor echo-berichten |
| `src/hooks/whatsapp/useWhatsAppMessages.ts` | + Realtime deduplicatie: check bestaande berichten + vervang optimistic messages |

---

### Visueel Resultaat Na Fix

```text
VOOR (huidige situatie - 2x "hallo"):
┌─────────────────────────────────────┐
│                          hallo →    │ ← verzonden (correct)
│                           18:40 ✓   │
├─────────────────────────────────────┤
│ hallo                               │ ← echo als "contact" (FOUT)
│ 18:41                               │
└─────────────────────────────────────┘

NA (gefixte situatie - 1x "hallo"):
┌─────────────────────────────────────┐
│                          hallo →    │ ← verzonden (correct)
│                           18:40 ✓   │
└─────────────────────────────────────┘
```

---

### Prioriteit

1. **Backend fix** (whatsapp-bridge) - voorkomt dat echo überhaupt in DB komt
2. **Frontend fix** (useWhatsAppMessages) - voorkomt tijdelijke dubbele weergave

De backend fix is het belangrijkst omdat het de bron van het probleem aanpakt. De frontend fix is een extra veiligheidslaag.

