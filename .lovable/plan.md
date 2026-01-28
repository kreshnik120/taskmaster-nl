
# WhatsApp Berichten Versturen - Implementatieplan

## Overzicht
Implementatie van de functionaliteit om WhatsApp berichten te versturen vanuit de UI, via de Edge Function naar de VPS.

## Architectuur

```text
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   UI Component  │────▶│  Edge Function       │────▶│   VPS Server    │
│ WhatsAppChat    │     │  whatsapp-bridge     │     │  72.61.155.82   │
│ Detail.tsx      │◀────│  (message.send)      │◀────│  :3001          │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
        │                         │
        │                         ▼
        │               ┌──────────────────────┐
        └──────────────▶│  whatsapp_messages   │
          (realtime)    │  (Supabase DB)       │
                        └──────────────────────┘
```

## Benodigde Secrets

| Secret | Waarde | Status |
|--------|--------|--------|
| WHATSAPP_VPS_API_KEY | `898b88e6d43cb61aa1b9b1a0bee322e62ef9187c9574ff25d1af21ac63acedfd` | **Nieuw toe te voegen** |
| WHATSAPP_VPS_SESSION_ID | `9a8c604c-4237-4e00-a50e-0a37cedbfbef` | **Nieuw toe te voegen** |

## Wijzigingen

### 1. Edge Function: `whatsapp-bridge/index.ts`

**Nieuwe event handler `message.send`:**

```typescript
case "message.send":
  result = await handleSendMessage(supabase, sessionId, orgId, data, requestId);
  break;
```

**Nieuwe functie `handleSendMessage`:**
- Ontvangt: `chatJid`, `body`, `chatId` uit data
- Stuurt POST naar VPS: `http://72.61.155.82:3001/chats/{chatJid}/messages`
- Headers: `x-api-key` (uit secret `WHATSAPP_VPS_API_KEY`)
- Body: `{ sessionId: WHATSAPP_VPS_SESSION_ID, text: body }`
- Slaat bericht op in `whatsapp_messages` met `sender_type: 'self'`, `status: 'sent'`
- Update `last_message_at` en `last_message_preview` in `whatsapp_chats`
- Retourneert `messageId`

### 2. Custom Hook: `useWhatsAppSendMessage.ts`

**Nieuwe hook voor berichten versturen:**

```typescript
export function useWhatsAppSendMessage(chatId: string, chatJid: string, orgId: string) {
  const queryClient = useQueryClient();
  
  const mutation = useMutation({
    mutationFn: async (text: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('whatsapp-bridge', {
        body: {
          event: 'message.send',
          sessionId: '9a8c604c-4237-4e00-a50e-0a37cedbfbef',
          orgId,
          data: { chatJid, body: text, chatId }
        }
      });
      
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['whatsapp-messages', chatId]);
      queryClient.invalidateQueries(['whatsapp-chats']);
    }
  });
  
  return mutation;
}
```

### 3. UI Component: `WhatsAppChatDetail.tsx`

**Wijzigingen:**
- Verwijder disabled state van Input en Button
- Voeg `useState` toe voor `inputText`
- Voeg `useWhatsAppSendMessage` hook toe
- Implementeer `handleSend` functie:
  - Valideer input (niet leeg)
  - Roep mutation aan
  - Clear input na success
  - Toon toast bij error

**Optimistic UI:**
- Bericht direct tonen met `status: 'pending'`
- Update naar `status: 'sent'` na server response
- Rollback bij error

### 4. Types Update: `whatsapp.ts`

Update `sender_type` om 'user' te ondersteunen (alias voor 'self'):

```typescript
sender_type: 'contact' | 'self' | 'user';
```

## Dataflow

1. **Gebruiker typt bericht** → Input component
2. **Klik verstuur** → `handleSend()` 
3. **Optimistic update** → Toon bericht met 'pending' status
4. **Edge Function call** → `supabase.functions.invoke('whatsapp-bridge', {...})`
5. **Edge Function** → POST naar VPS endpoint
6. **VPS Response** → messageId terug
7. **DB Insert** → Bericht opgeslagen in `whatsapp_messages`
8. **Realtime update** → UI krijgt bevestiging via subscription
9. **Chat update** → `last_message_at` en preview bijgewerkt

## Veiligheidsoverwegingen

- VPS API key wordt alleen server-side gebruikt (Edge Function)
- Session ID wordt server-side opgeslagen als secret
- Gebruiker moet ingelogd zijn (auth check in hook)
- Org validatie gebeurt in Edge Function

## Bestanden

| # | Bestand | Actie |
|---|---------|-------|
| 1 | `supabase/functions/whatsapp-bridge/index.ts` | Aanpassen - nieuwe `message.send` handler |
| 2 | `src/hooks/whatsapp/useWhatsAppSendMessage.ts` | **Nieuw** - mutation hook |
| 3 | `src/components/whatsapp/WhatsAppChatDetail.tsx` | Aanpassen - input activeren, send functie |
| 4 | `src/types/whatsapp.ts` | Aanpassen - sender_type uitbreiden |

## Test Scenario's

1. Verstuur tekst bericht → Verschijnt in UI + database
2. Verstuur leeg bericht → Validatie error
3. VPS timeout → Error toast + geen database entry
4. Realtime update → Nieuwe inkomende berichten verschijnen nog steeds

## Technische Details

**VPS Endpoint:**
```
POST http://72.61.155.82:3001/chats/{chatJid}/messages
Headers:
  Content-Type: application/json
  x-api-key: [WHATSAPP_VPS_API_KEY]
Body:
  {
    "sessionId": "[WHATSAPP_VPS_SESSION_ID]",
    "text": "Berichttekst"
  }
Response:
  {
    "messageId": "uuid-van-verzonden-bericht"
  }
```

**Database Insert:**
```sql
INSERT INTO whatsapp_messages (
  org_id, chat_id, message_id, message_type, 
  message_body, sender_type, sent_at, status
) VALUES (
  $orgId, $chatId, $vpsMessageId, 'text',
  $body, 'self', NOW(), 'sent'
);
```
