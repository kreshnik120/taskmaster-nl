

# Plan: Fix WhatsApp Media Display Bug

## Probleem Identificatie

Na uitgebreide analyse heb ik bevestigd dat:
- De database data is correct
- De API response bevat de media array met storage URLs
- De join query in de hook werkt correct

Het probleem zit in de UI rendering: de `message_body` met "[Media]" wordt getoond **onder** de afbeelding, wat visueel verwarrend is.

## Root Cause

In `WhatsAppMessageBubble.tsx` (regel 110-113) wordt `message.message_body` altijd getoond wanneer die bestaat:

```tsx
{message.message_body && (
  <p>{message.message_body}</p>
)}
```

Dit betekent dat bij een afbeelding:
1. De afbeelding wordt gerenderd
2. "[Media]" tekst wordt ook gerenderd eronder

## Oplossing

Wijzig de logica om "[Media]" niet te tonen wanneer er media aanwezig is.

### Bestand: `src/components/whatsapp/WhatsAppMessageBubble.tsx`

**Wijziging (regel 109-114):**

```typescript
// Van:
{message.message_body && (
  <p className="text-sm text-foreground whitespace-pre-wrap break-words">
    {message.message_body}
  </p>
)}

// Naar:
{message.message_body && message.message_body !== '[Media]' && (
  <p className="text-sm text-foreground whitespace-pre-wrap break-words">
    {message.message_body}
  </p>
)}
```

### Extra verbetering: Loading state voor media

Voeg ook een loading indicator toe voor berichten die media moeten hebben maar nog niet geladen zijn:

```typescript
// Na de media rendering blokken, voor message_body:
{!hasMedia && ['image', 'video', 'audio', 'document'].includes(message.message_type) && (
  <div className="flex items-center gap-2 p-2 text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" />
    <span className="text-sm italic">Media wordt geladen...</span>
  </div>
)}
```

## Bestanden Overzicht

| Actie | Bestand | Beschrijving |
|-------|---------|--------------|
| EDIT | `src/components/whatsapp/WhatsAppMessageBubble.tsx` | Filter "[Media]" uit message_body, voeg loading state toe |

## Technische Details

### Huidige flow:
```text
message.media = [{storage_url: "https://..."}]
message.message_body = "[Media]"
             ↓
Render: <img src="..."/> + <p>[Media]</p>
```

### Na fix:
```text
message.media = [{storage_url: "https://..."}]
message.message_body = "[Media]"
             ↓
Render: <img src="..."/> (geen "[Media]" tekst)
```

## Verificatie

Na implementatie:
1. Open de chat op `/whatsapp/chat/4c9a25f0-f1a2-4957-a09d-b4e03ee2a1da`
2. Afbeeldingen moeten nu zichtbaar zijn zonder "[Media]" tekst eronder
3. Berichten met caption (zoals "[Image caption]") moeten de caption wel tonen

