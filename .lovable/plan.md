
# Plan: Media Placeholder Vervangen

## Probleem
ClawdBot stuurt `<media:image>` (of vergelijkbare placeholders) als body tekst voor media berichten. De huidige code controleert alleen of `body` leeg is, niet of het een placeholder bevat.

**Huidige code (regel 262-263)**:
```typescript
// Determine effective body: use original body, or emoji placeholder for media-only messages
const effectiveBody = body || (effectiveMedia ? '📷 Afbeelding' : '');
```

## Oplossing
Voeg een check toe om `<media:...>` placeholders te detecteren en te behandelen als "geen tekst".

## Implementatie

**Bestand**: `supabase/functions/whatsapp-bridge/index.ts`

**Wijziging (regel 262-263)**:
```typescript
// Clean body: strip media placeholders like <media:image>, <media:audio>, etc.
const cleanBody = body?.startsWith('<media:') ? null : body;

// Determine effective body: use cleaned body, or emoji placeholder for media-only messages
const effectiveBody = cleanBody || (effectiveMedia ? '📷 Afbeelding' : '');
```

## Impact
- Berichten met `<media:image>` worden nu getoond als "📷 Afbeelding"
- Berichten met echte tekst + media behouden hun tekst
- Berichten met alleen tekst (geen media) blijven ongewijzigd
- Backwards compatible met alle bestaande berichten

## Verificatie
Na deployment:
1. Stuur een afbeelding via WhatsApp (zonder tekst)
2. Check dat de preview "📷 Afbeelding" toont in plaats van `<media:image>`
3. Stuur een afbeelding met tekst erbij
4. Check dat de tekst correct wordt getoond
