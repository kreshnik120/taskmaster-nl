
# Plan: Fix Payload Structuur voor WhatsApp Bridge

## Probleem

De `whatsapp-bridge` verwacht dat `to` en `body` (message) in een `data` object zitten, maar `mcp-proxy` stuurt deze momenteel op het hoogste niveau.

**Error:** `500 - Cannot read properties of undefined (reading 'to')`

## Huidige Structuur (Fout)

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

## Gewenste Structuur (Correct)

```json
{
  "event": "message.send",
  "sessionId": "clawdbot-default",
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "to": "31648005001@s.whatsapp.net",
    "body": "Test bericht"
  }
}
```

## Wijzigingen

### 1. handleUiMode (Regels 175-182)

**Huidige code:**
```typescript
body: JSON.stringify({
  event: "message.send",
  sessionId: "clawdbot-default",
  orgId: "550e8400-e29b-41d4-a716-446655440000",
  action: "send_message",
  to: toolArgs.to,
  message: toolArgs.message,
}),
```

**Nieuwe code:**
```typescript
body: JSON.stringify({
  event: "message.send",
  sessionId: "clawdbot-default",
  orgId: "550e8400-e29b-41d4-a716-446655440000",
  data: {
    to: toolArgs.to,
    body: toolArgs.message,
  }
}),
```

### 2. handleSendMessage (Regels 427-434)

**Huidige code:**
```typescript
body: JSON.stringify({
  event: "message.send",
  sessionId: "clawdbot-default",
  orgId: "550e8400-e29b-41d4-a716-446655440000",
  action: "send_message",
  to,
  message,
}),
```

**Nieuwe code:**
```typescript
body: JSON.stringify({
  event: "message.send",
  sessionId: "clawdbot-default",
  orgId: "550e8400-e29b-41d4-a716-446655440000",
  data: {
    to,
    body: message,
  }
}),
```

## Samenvatting

| Locatie | Regel | Wijziging |
|---------|-------|-----------|
| `handleUiMode` | 175-182 | Wrap `to`/`message` in `data` object, gebruik key `body` |
| `handleSendMessage` | 427-434 | Wrap `to`/`message` in `data` object, gebruik key `body` |

## Na Implementatie

De bridge ontvangt nu het correcte formaat en kan `data.to` en `data.body` uitlezen zonder undefined errors.

## Verificatie

1. Open WhatsApp chat
2. Stuur een testbericht
3. Geen 500 error meer
4. Bericht moet succesvol verstuurd worden via de Relay Service
