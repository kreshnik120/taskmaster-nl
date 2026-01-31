# VPS WhatsApp Relay - Webhook Specificatie

> **Versie:** 1.0  
> **Laatste update:** 31 januari 2026  
> **Doel:** Specificatie voor webhook events die de VPS WhatsApp Relay moet versturen naar de Lovable Cloud Edge Function.

---

## Endpoint

```
POST https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/whatsapp-bridge
```

## Authenticatie

Alle requests moeten de volgende header bevatten:

| Header | Waarde |
|--------|--------|
| `x-api-key` | `[WHATSAPP_WEBHOOK_SECRET]` |
| `Content-Type` | `application/json` |

---

## Webhook Events

### 1. `message.received` - Inkomend Bericht

Wordt verstuurd wanneer een nieuw bericht binnenkomt.

#### Tekst Bericht

```json
{
  "event": "message.received",
  "sessionId": "clawdbot-default",
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "messageId": "ABCD1234567890",
    "chatJid": "31612345678@s.whatsapp.net",
    "senderJid": "31612345678@s.whatsapp.net",
    "pushName": "Jan de Vries",
    "messageType": "text",
    "body": "Hallo, dit is een testbericht!",
    "timestamp": 1706700000000
  }
}
```

#### Media Bericht (Afbeelding/Document/Audio/Video)

```json
{
  "event": "message.received",
  "sessionId": "clawdbot-default",
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "messageId": "EFGH5678901234",
    "chatJid": "31612345678@s.whatsapp.net",
    "senderJid": "31612345678@s.whatsapp.net",
    "pushName": "Jan de Vries",
    "messageType": "image",
    "body": "Optioneel caption bij afbeelding",
    "timestamp": 1706700000000,
    "media": {
      "mimetype": "image/jpeg",
      "filename": "photo.jpg",
      "base64": "/9j/4AAQSkZJRgABAQEASABI..."
    }
  }
}
```

| `messageType` | Beschrijving |
|---------------|--------------|
| `text` | Tekstbericht |
| `image` | Afbeelding |
| `video` | Video |
| `audio` | Spraakbericht of audio |
| `document` | PDF, Word, Excel, etc. |

---

### 2. `message.ack` - Bevestiging (Read Receipts)

Wordt verstuurd wanneer een verzonden bericht status updates krijgt.

```json
{
  "event": "message.ack",
  "sessionId": "clawdbot-default",
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "messageId": "sent_1706700000000_abc12345",
    "ack": 3,
    "chatJid": "31612345678@s.whatsapp.net"
  }
}
```

| `ack` Code | Status | Beschrijving |
|------------|--------|--------------|
| `1` | `sent` | Bericht verzonden naar WhatsApp servers |
| `2` | `delivered` | Bericht afgeleverd op apparaat ontvanger |
| `3` | `read` | Bericht gelezen door ontvanger |
| `4` | `read` | Bericht afgespeeld (voor audio) |

---

### 3. `message.typing` - Typing Indicator

Wordt verstuurd wanneer iemand aan het typen is of stopt met typen.

```json
{
  "event": "message.typing",
  "sessionId": "clawdbot-default",
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "chatJid": "31612345678@s.whatsapp.net",
    "isTyping": true,
    "senderJid": "31612345678@s.whatsapp.net",
    "pushName": "Jan de Vries"
  }
}
```

| Veld | Type | Beschrijving |
|------|------|--------------|
| `isTyping` | `boolean` | `true` = aan het typen, `false` = gestopt |
| `pushName` | `string` | Naam van de persoon die typt (optioneel) |

---

### 4. `session.connected` - Sessie Verbonden

Wordt verstuurd wanneer WhatsApp succesvol is verbonden.

```json
{
  "event": "session.connected",
  "sessionId": "clawdbot-default",
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "phoneNumber": "31687654321",
    "pushName": "ClawdBot Business",
    "platform": "android"
  }
}
```

---

### 5. `session.disconnected` - Sessie Verbroken

Wordt verstuurd wanneer de WhatsApp verbinding verbroken is.

```json
{
  "event": "session.disconnected",
  "sessionId": "clawdbot-default",
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "reason": "logged_out",
    "timestamp": 1706700000000
  }
}
```

| `reason` | Beschrijving |
|----------|--------------|
| `logged_out` | Gebruiker heeft uitgelogd |
| `replaced` | Sessie vervangen door nieuwe login |
| `connection_lost` | Netwerk connectie verloren |
| `banned` | Account geblokkeerd door WhatsApp |

---

### 6. `session.qr` - QR Code voor Pairing

Wordt verstuurd wanneer een nieuwe QR code beschikbaar is voor koppeling.

```json
{
  "event": "session.qr",
  "sessionId": "clawdbot-default",
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "qr": "2@ABC123XYZ...",
    "expiresAt": 1706700060000
  }
}
```

---

## Technische Vereisten

### Timestamps

Alle timestamps moeten in **Unix milliseconden** zijn (niet seconden).

```javascript
// Correct
"timestamp": 1706700000000

// Fout
"timestamp": 1706700000
```

### Organization ID

Gebruik altijd de correcte `orgId`:

```
550e8400-e29b-41d4-a716-446655440000
```

### JID Formaten

| Type | Formaat | Voorbeeld |
|------|---------|-----------|
| Individueel | `{telefoonnummer}@s.whatsapp.net` | `31612345678@s.whatsapp.net` |
| Groep | `{groepId}@g.us` | `120363123456789012@g.us` |

---

## Testen

### cURL Voorbeelden

#### Test Inkomend Bericht

```bash
curl -X POST "https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/whatsapp-bridge" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_WEBHOOK_SECRET" \
  -d '{
    "event": "message.received",
    "sessionId": "clawdbot-default",
    "orgId": "550e8400-e29b-41d4-a716-446655440000",
    "data": {
      "messageId": "TEST_MSG_001",
      "chatJid": "31612345678@s.whatsapp.net",
      "senderJid": "31612345678@s.whatsapp.net",
      "pushName": "Test User",
      "messageType": "text",
      "body": "Dit is een testbericht",
      "timestamp": '$(date +%s000)'
    }
  }'
```

#### Test Read Receipt (ack=3)

```bash
curl -X POST "https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/whatsapp-bridge" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_WEBHOOK_SECRET" \
  -d '{
    "event": "message.ack",
    "sessionId": "clawdbot-default",
    "orgId": "550e8400-e29b-41d4-a716-446655440000",
    "data": {
      "messageId": "sent_1706700000000_abc12345",
      "ack": 3,
      "chatJid": "31612345678@s.whatsapp.net"
    }
  }'
```

#### Test Typing Indicator

```bash
curl -X POST "https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/whatsapp-bridge" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_WEBHOOK_SECRET" \
  -d '{
    "event": "message.typing",
    "sessionId": "clawdbot-default",
    "orgId": "550e8400-e29b-41d4-a716-446655440000",
    "data": {
      "chatJid": "31612345678@s.whatsapp.net",
      "isTyping": true,
      "senderJid": "31612345678@s.whatsapp.net",
      "pushName": "Jan de Vries"
    }
  }'
```

---

## Response Codes

| Status | Beschrijving |
|--------|--------------|
| `200` | Event succesvol verwerkt |
| `401` | Ongeldige of ontbrekende `x-api-key` |
| `400` | Ongeldig request formaat |
| `500` | Server error bij verwerking |

---

## Changelog

| Datum | Versie | Wijziging |
|-------|--------|-----------|
| 2026-01-31 | 1.0 | Initiële versie met alle webhook events |
