
# Plan: Configureer WhatsApp Relay Service

## Overzicht

De VPS heeft een nieuwe Relay Service draaien op poort 58438. De huidige `handleSendMessage` in `whatsapp-bridge` moet worden aangepast om deze nieuwe relay te gebruiken in plaats van de oude VPS API.

## Stap 1: Nieuwe Secrets Toevoegen

Twee secrets moeten worden toegevoegd aan het project:

| Secret | Waarde |
|--------|--------|
| `CLAWDBOT_VPS_URL` | `http://72.61.155.82:58438` |
| `CLAWDBOT_TOKEN` | `xsm1gbaONAWW8Axx7jUEyJ7cyVcOTjcy` |

## Stap 2: Update handleSendMessage

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`  
**Locatie:** Regels 633-720

### Huidige Situatie

De bestaande functie:
- Verwacht velden: `chatJid`, `body`, `chatId`
- Gebruikt oude credentials: `WHATSAPP_VPS_API_KEY`, `WHATSAPP_VPS_SESSION_ID`
- Roept oude endpoint aan: `http://72.61.155.82:3001/chats/{chatJid}/messages`

### Aanpassingen

De mcp-proxy stuurt nu:
```json
{
  "event": "message.send",
  "sessionId": "clawdbot-default",
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "action": "send_message",
  "to": "31648005001@s.whatsapp.net",
  "message": "Test bericht"
}
```

De functie moet worden aangepast om:

1. Beide formaten te accepteren (`to`/`message` EN `chatJid`/`body`)
2. De nieuwe Relay credentials te gebruiken (`CLAWDBOT_VPS_URL`, `CLAWDBOT_TOKEN`)
3. Het juiste endpoint aan te roepen: `${CLAWDBOT_VPS_URL}/send`
4. Authorization header te gebruiken: `Bearer ${CLAWDBOT_TOKEN}`

### Nieuwe Code

```typescript
async function handleSendMessage(
  supabase: SupabaseClientAny,
  orgId: string,
  data: Record<string, unknown>,
  requestId: string
): Promise<Record<string, unknown>> {
  // Support both formats: mcp-proxy sends 'to' + 'message', legacy uses 'chatJid' + 'body'
  const to = (data.to as string) || (data.chatJid as string);
  const body = (data.message as string) || (data.body as string);
  const chatId = data.chatId as string | undefined;

  if (!to || !body) {
    throw new Error("Missing required fields: to/chatJid, message/body");
  }

  console.log(`[${requestId}] Sending message via Relay to: ${to}`);

  // Get new Relay credentials
  const vpsUrl = Deno.env.get("CLAWDBOT_VPS_URL");
  const token = Deno.env.get("CLAWDBOT_TOKEN");

  if (!vpsUrl || !token) {
    throw new Error("Configuration missing: CLAWDBOT_VPS_URL or CLAWDBOT_TOKEN");
  }

  // Call the Relay Service
  const relayResponse = await fetch(`${vpsUrl}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ to, message: body }),
  });

  if (!relayResponse.ok) {
    const errorText = await relayResponse.text();
    console.error(`[${requestId}] Relay error: ${relayResponse.status} - ${errorText}`);
    throw new Error(`Relay error: ${relayResponse.status} - ${errorText}`);
  }

  const relayResult = await relayResponse.json();
  console.log(`[${requestId}] Relay response:`, relayResult);

  const messageId = relayResult.messageId || relayResult.id || crypto.randomUUID();

  // If chatId provided, store in database
  if (chatId) {
    const { data: message, error: messageError } = await supabase
      .from("whatsapp_messages")
      .insert({
        org_id: orgId,
        chat_id: chatId,
        message_id: messageId,
        message_type: "text",
        message_body: body,
        sender_type: "self",
        sender_phone: null,
        sent_at: new Date().toISOString(),
        status: "sent",
      })
      .select("id")
      .single();

    if (messageError) {
      console.error(`[${requestId}] DB insert error:`, messageError);
      // Don't throw - message was sent successfully
    } else {
      // Update chat with last message info
      await supabase
        .from("whatsapp_chats")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: body.substring(0, 100),
        })
        .eq("id", chatId);

      console.log(`[${requestId}] ✅ Message sent and stored: ${message.id}`);
      return { sent: true, messageId: message.id, providerId: messageId };
    }
  }

  console.log(`[${requestId}] ✅ Message sent via Relay (no DB storage)`);
  return { sent: true, providerId: messageId };
}
```

## Stap 3: Deploy

Deploy de `whatsapp-bridge` Edge Function na de wijzigingen.

## Samenvatting

| Actie | Details |
|-------|---------|
| Secret 1 | `CLAWDBOT_VPS_URL` = `http://72.61.155.82:58438` |
| Secret 2 | `CLAWDBOT_TOKEN` = `xsm1gbaONAWW8Axx7jUEyJ7cyVcOTjcy` |
| Code wijziging | `handleSendMessage` functie (regels 633-720) |
| Nieuwe endpoint | `${CLAWDBOT_VPS_URL}/send` |
| Nieuwe auth | `Authorization: Bearer ${CLAWDBOT_TOKEN}` |
| Deploy | `whatsapp-bridge` Edge Function |

## Verificatie

Na implementatie:
1. Open WhatsApp chat
2. Stuur een testbericht
3. Check Edge Function logs: succesvol via Relay
4. Bericht moet aankomen op WhatsApp
