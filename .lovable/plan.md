
# Plan: Wijzig Event Type naar message.send

## Probleem

De `whatsapp-bridge` accepteert `system.outgoing_message` niet. De bridge is aangepast om te luisteren naar `message.send`.

**Huidige error:** Event type wordt niet herkend door de bridge.

## Oplossing

Wijzig het `event` veld in de JSON body op twee locaties.

## Wijzigingen

### 1. UI Mode (handleUiMode - regel 176)

```text
// Oud:
event: "system.outgoing_message",

// Nieuw:
event: "message.send",
```

### 2. MCP Mode (handleSendMessage - regel 428)

```text
// Oud:
event: "system.outgoing_message",

// Nieuw:
event: "message.send",
```

## Bestand

`supabase/functions/mcp-proxy/index.ts`

## Resultaat Na Implementatie

De request body wordt:
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

## Verificatie

Na deployment:
1. Open WhatsApp chat
2. Stuur een testbericht
3. Bericht moet succesvol verstuurd worden
