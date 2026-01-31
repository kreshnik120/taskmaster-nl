

# WhatsApp Data Uitbreiding - Implementatieplan

## Overzicht

Dit plan implementeert twee fasen van WhatsApp verbeteringen:
1. **Fase 1**: Groepsberichten tonen wie het stuurde (sender_jid, sender_name)
2. **Fase 2**: Reply/Quote functionaliteit (quoted_message_id, quoted_message_preview)

---

## Huidige Situatie

### Database Schema (whatsapp_messages)
Huidige kolommen:
- `id`, `org_id`, `chat_id`, `message_id`
- `message_type`, `message_body`
- `sender_type`, `sender_phone`
- `sent_at`, `status`, `created_at`

**Ontbrekend:** `sender_jid`, `sender_name`, `quoted_message_id`, `quoted_message_preview`

### Webhook Handler (whatsapp-bridge)
De VPS stuurt al `from` (JID van afzender) en `fromName` (pushname), maar deze worden niet opgeslagen voor groepsberichten.

### UI Component (WhatsAppMessageBubble)
Toont momenteel geen afzendernaam voor groepsberichten.

---

## Fase 1: Groepsberichten Afzender

### 1.1 Database Migratie

```sql
-- Nieuwe kolommen voor groepsberichten afzender
ALTER TABLE whatsapp_messages 
ADD COLUMN sender_jid TEXT,
ADD COLUMN sender_name TEXT;

-- Index voor efficiënte queries op sender_jid
CREATE INDEX idx_whatsapp_messages_sender_jid 
ON whatsapp_messages(sender_jid) 
WHERE sender_jid IS NOT NULL;

COMMENT ON COLUMN whatsapp_messages.sender_jid IS 'WhatsApp JID van de afzender (relevant voor groepsberichten)';
COMMENT ON COLUMN whatsapp_messages.sender_name IS 'Display naam van de afzender op moment van verzending';
```

### 1.2 Webhook Handler Update

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

Wijzigingen in `handleMessageReceived` functie (rond regel 334-346):

```typescript
// VOOR (huidige code):
.insert({
  org_id: orgId,
  chat_id: chat.id,
  message_id: messageId,
  message_type: type || "text",
  message_body: effectiveBody,
  sender_type: isFromSelf ? "self" : "contact",
  sender_phone: from,
  sent_at: new Date(timestamp).toISOString(),
  status: isFromSelf ? "sent" : "received",
})

// NA (met groepsafzender):
.insert({
  org_id: orgId,
  chat_id: chat.id,
  message_id: messageId,
  message_type: type || "text",
  message_body: effectiveBody,
  sender_type: isFromSelf ? "self" : "contact",
  sender_phone: from,
  sent_at: new Date(timestamp).toISOString(),
  status: isFromSelf ? "sent" : "received",
  // Nieuwe velden voor groepsberichten
  sender_jid: isGroupChat ? from : null,
  sender_name: isGroupChat ? (fromName || null) : null,
})
```

### 1.3 TypeScript Types Update

**Bestand:** `src/types/whatsapp.ts`

```typescript
export interface WhatsAppMessage {
  id: string;
  org_id: string;
  chat_id: string;
  message_id: string;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'document';
  message_body: string | null;
  sender_type: 'contact' | 'self' | 'user';
  sender_phone: string | null;
  sent_at: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'received';
  created_at: string;
  media?: WhatsAppMedia[];
  // Nieuwe velden voor Fase 1
  sender_jid?: string | null;
  sender_name?: string | null;
}
```

### 1.4 UI Component Update

**Bestand:** `src/components/whatsapp/WhatsAppMessageBubble.tsx`

Toevoegen van groepsafzender weergave boven berichten:

```typescript
interface WhatsAppMessageBubbleProps {
  message: WhatsAppMessage;
  isGroupChat?: boolean;  // Nieuwe prop
}

export function WhatsAppMessageBubble({ message, isGroupChat = false }: WhatsAppMessageBubbleProps) {
  // Bestaande code...
  
  // Bepaal of we de afzendernaam moeten tonen
  const showSenderName = isGroupChat && 
                         !isOutgoing && 
                         message.sender_name;

  return (
    <div className={cn("flex", isOutgoing ? "justify-end" : "justify-start")}>
      <div className={cn(/* bestaande classes */)}>
        
        {/* NIEUW: Afzendernaam voor groepsberichten */}
        {showSenderName && (
          <p className="text-xs font-medium text-primary mb-1 truncate">
            {message.sender_name}
          </p>
        )}
        
        {/* Bestaande media en tekst rendering... */}
      </div>
    </div>
  );
}
```

### 1.5 Chat Detail Update

**Bestand:** `src/components/whatsapp/WhatsAppChatDetail.tsx`

Pass `isGroupChat` prop door naar MessageBubble:

```typescript
// In itemContent render
itemContent={(index, item) => {
  if (item.type === 'divider') {
    return <DateDivider label={item.label} />;
  }
  return (
    <div className="py-1 w-full">
      <WhatsAppMessageBubble 
        message={item.message} 
        isGroupChat={chat.chat_type === 'group'}  // NIEUW
      />
    </div>
  );
}}
```

---

## Fase 2: Reply/Quote Functionaliteit

### 2.1 Database Migratie

```sql
-- Kolommen voor reply/quote
ALTER TABLE whatsapp_messages 
ADD COLUMN quoted_message_id TEXT,
ADD COLUMN quoted_message_preview TEXT;

-- Index voor het vinden van gerelateerde berichten
CREATE INDEX idx_whatsapp_messages_quoted 
ON whatsapp_messages(quoted_message_id) 
WHERE quoted_message_id IS NOT NULL;

COMMENT ON COLUMN whatsapp_messages.quoted_message_id IS 'WhatsApp message ID van het geciteerde bericht';
COMMENT ON COLUMN whatsapp_messages.quoted_message_preview IS 'Preview (max 100 chars) van het geciteerde bericht';
```

### 2.2 Webhook Handler Update

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

Uitbreiden van data extractie en insert:

```typescript
// In handleMessageReceived, update data destructuring:
const { 
  messageId, chatJid, from, fromName, body, timestamp, type, isGroup, groupName,
  media_base64, media_filename, mediaType,
  // NIEUW: Quote velden
  quotedMessage
} = data as {
  // bestaande types...
  quotedMessage?: {
    id?: string;
    body?: string;
    from?: string;
  };
};

// Extract quote data
const quotedMessageId = quotedMessage?.id || null;
const quotedMessagePreview = quotedMessage?.body 
  ? quotedMessage.body.substring(0, 100) 
  : null;

// In insert statement:
.insert({
  // bestaande velden...
  sender_jid: isGroupChat ? from : null,
  sender_name: isGroupChat ? (fromName || null) : null,
  // NIEUW: Quote velden
  quoted_message_id: quotedMessageId,
  quoted_message_preview: quotedMessagePreview,
})
```

### 2.3 TypeScript Types Update

**Bestand:** `src/types/whatsapp.ts`

```typescript
export interface WhatsAppMessage {
  // bestaande velden...
  sender_jid?: string | null;
  sender_name?: string | null;
  // Nieuwe velden voor Fase 2
  quoted_message_id?: string | null;
  quoted_message_preview?: string | null;
}
```

### 2.4 Quote Box Component

**Nieuw bestand:** `src/components/whatsapp/WhatsAppQuoteBox.tsx`

```typescript
interface WhatsAppQuoteBoxProps {
  preview: string;
  className?: string;
}

export function WhatsAppQuoteBox({ preview, className }: WhatsAppQuoteBoxProps) {
  return (
    <div className={cn(
      "border-l-4 border-primary/50 bg-muted/30 rounded-r-lg px-2 py-1 mb-2",
      className
    )}>
      <p className="text-xs text-muted-foreground line-clamp-2">
        {preview}
      </p>
    </div>
  );
}
```

### 2.5 Message Bubble Update

**Bestand:** `src/components/whatsapp/WhatsAppMessageBubble.tsx`

Integreer de quote box:

```typescript
import { WhatsAppQuoteBox } from "./WhatsAppQuoteBox";

export function WhatsAppMessageBubble({ message, isGroupChat = false }: WhatsAppMessageBubbleProps) {
  const hasQuote = message.quoted_message_preview;
  
  return (
    <div className={cn(/* classes */)}>
      {/* Afzendernaam voor groepen */}
      {showSenderName && (
        <p className="text-xs font-medium text-primary mb-1">{message.sender_name}</p>
      )}
      
      {/* NIEUW: Quote box als antwoord op bericht */}
      {hasQuote && (
        <WhatsAppQuoteBox preview={message.quoted_message_preview!} />
      )}
      
      {/* Bestaande media en tekst... */}
    </div>
  );
}
```

---

## Bestanden Overzicht

| Fase | Bestand | Actie |
|------|---------|-------|
| 1 | Database migratie | CREATE (2 kolommen) |
| 1 | `supabase/functions/whatsapp-bridge/index.ts` | UPDATE |
| 1 | `src/types/whatsapp.ts` | UPDATE |
| 1 | `src/components/whatsapp/WhatsAppMessageBubble.tsx` | UPDATE |
| 1 | `src/components/whatsapp/WhatsAppChatDetail.tsx` | UPDATE |
| 2 | Database migratie | CREATE (2 kolommen) |
| 2 | `supabase/functions/whatsapp-bridge/index.ts` | UPDATE |
| 2 | `src/types/whatsapp.ts` | UPDATE |
| 2 | `src/components/whatsapp/WhatsAppQuoteBox.tsx` | CREATE |
| 2 | `src/components/whatsapp/WhatsAppMessageBubble.tsx` | UPDATE |

---

## Technische Details

### VPS Payload Structuur (Verwacht)

```json
{
  "event": "message.received",
  "sessionId": "...",
  "orgId": "...",
  "data": {
    "messageId": "ABC123",
    "chatJid": "1234567890@g.us",
    "from": "31612345678@s.whatsapp.net",
    "fromName": "Jan Jansen",
    "body": "Dit is mijn antwoord",
    "timestamp": 1706745600000,
    "type": "text",
    "isGroup": true,
    "groupName": "Project Team",
    "quotedMessage": {
      "id": "XYZ789",
      "body": "Oorspronkelijk bericht waar op gereageerd wordt",
      "from": "31698765432@s.whatsapp.net"
    }
  }
}
```

### Database Query Voorbeeld

```sql
-- Berichten met afzender en quote info ophalen
SELECT 
  m.*,
  CASE WHEN m.sender_name IS NOT NULL 
       THEN m.sender_name 
       ELSE c.display_name 
  END as display_sender
FROM whatsapp_messages m
LEFT JOIN whatsapp_contacts c ON c.whatsapp_jid = m.sender_jid
WHERE m.chat_id = :chatId
ORDER BY m.sent_at DESC;
```

---

## Implementatie Volgorde

1. **Stap 1**: Database migratie voor Fase 1 kolommen
2. **Stap 2**: Webhook handler update voor sender_jid/sender_name
3. **Stap 3**: TypeScript types update
4. **Stap 4**: UI componenten voor groepsafzender
5. **Stap 5**: Testen van Fase 1
6. **Stap 6**: Database migratie voor Fase 2 kolommen
7. **Stap 7**: Webhook handler update voor quotedMessage
8. **Stap 8**: QuoteBox component en integratie
9. **Stap 9**: End-to-end testen

