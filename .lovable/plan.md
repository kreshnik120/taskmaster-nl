
# Plan: Fix Missing Fields in WhatsApp Bridge Request

## Probleem

De `whatsapp-bridge` Edge Function valideert strikt op verplichte velden:
- `event` - Type event (bijv. `system.outgoing_message`)
- `sessionId` - ClawdBot sessie identifier
- `orgId` - Organisatie UUID

**Error:** `400 - Missing required fields: event, sessionId, orgId`

## Oplossing

Voeg de ontbrekende velden toe aan beide plekken waar `WHATSAPP_BRIDGE_URL` wordt aangeroepen.

## Wijzigingen

### 1. UI Mode (handleUiMode - regel 175-179)

**Huidige code:**
```typescript
body: JSON.stringify({
  action: "send_message",
  to: toolArgs.to,
  message: toolArgs.message,
}),
```

**Nieuwe code:**
```typescript
body: JSON.stringify({
  event: "system.outgoing_message",
  sessionId: "clawdbot-default",
  orgId: "550e8400-e29b-41d4-a716-446655440000",
  action: "send_message",
  to: toolArgs.to,
  message: toolArgs.message,
}),
```

### 2. MCP Mode (handleSendMessage - regel 424-428)

**Huidige code:**
```typescript
body: JSON.stringify({
  action: "send_message",
  to,
  message,
}),
```

**Nieuwe code:**
```typescript
body: JSON.stringify({
  event: "system.outgoing_message",
  sessionId: "clawdbot-default",
  orgId: "550e8400-e29b-41d4-a716-446655440000",
  action: "send_message",
  to,
  message,
}),
```

## Samenvatting

| Locatie | Regel | Wijziging |
|---------|-------|-----------|
| `handleUiMode` | 175-179 | Voeg `event`, `sessionId`, `orgId` toe |
| `handleSendMessage` | 424-428 | Voeg `event`, `sessionId`, `orgId` toe |

## Na Implementatie

De request body bevat nu alle verplichte velden die `whatsapp-bridge` verwacht:
```json
{
  "event": "system.outgoing_message",
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
3. Geen 400 error meer
4. Bericht moet succesvol verstuurd worden
