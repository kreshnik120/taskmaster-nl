

# Diagnose: Groepsberichten Sender Data

## Conclusie

**Er zijn TWEE problemen gevonden:**

### Probleem 1: Veld Mapping Mismatch (Lovable-zijde)

De VPS Webhook Spec definieert:
```json
{
  "senderJid": "31612345678@s.whatsapp.net",
  "pushName": "Jan de Vries"
}
```

Maar de `whatsapp-bridge` code verwacht:
```typescript
const { from, fromName } = data;  // Verkeerde veldnamen!
```

| VPS Stuurt | Code Verwacht | Status |
|------------|---------------|--------|
| `senderJid` | `from` | Mismatch |
| `pushName` | `fromName` | Mismatch |

### Probleem 2: VPS Stuurt Inconsistente Data

Database query resultaten tonen:
- **Oudere berichten**: `sender_phone` = `98917425365000` (individueel telefoonnummer - CORRECT)
- **Nieuwere berichten**: `sender_phone` = `31618710360-1629291774@g.us` (groep JID - FOUT)

Dit suggereert een regressie op de VPS of dat sommige events met andere veldnamen komen.

---

## Oplossing

### Stap 1: Update whatsapp-bridge om BEIDE veldnamen te ondersteunen

De code moet flexibel zijn en zowel de oude als nieuwe veldnamen accepteren:

```typescript
// In handleMessageReceived (regel 237-247)
const { 
  messageId, chatJid, 
  // Support both old and new field names
  from, fromName,           // Legacy
  senderJid, pushName,      // VPS Spec v1.0
  body, timestamp, type, isGroup, groupName,
  quotedMessage
} = data as { ... };

// Prioriteer spec-compliant velden, val terug op legacy
const effectiveFrom = senderJid || from;
const effectiveFromName = pushName || fromName;
```

### Stap 2: Update isFromSelf logic

De `isFromSelf` check moet de `effectiveFrom` gebruiken:

```typescript
const normalizedFrom = normalizePhone(effectiveFrom);
const isFromSelf = !isGroupChat && normalizedFrom === normalizedSessionPhone;
```

### Stap 3: Update insert statement

```typescript
.insert({
  // ... existing fields ...
  sender_phone: effectiveFrom,
  sender_jid: isGroupChat ? effectiveFrom : null,
  sender_name: isGroupChat ? (effectiveFromName || null) : null,
})
```

### Stap 4: Add debug logging

Tijdelijk extra logging om te zien wat er exact binnenkomt:

```typescript
console.log(`[${requestId}] Raw data fields:`, {
  from, fromName, senderJid, pushName, 
  isGroup, chatJid
});
```

---

## VPS-zijde Fix Nodig

De VPS moet ook worden gecontroleerd:

1. **Controleer of `senderJid` correct wordt meegegeven** voor groepsberichten
2. **Controleer of `pushName`** (afzender naam) wordt meegegeven
3. **Vergelijk oude vs nieuwe code** - er lijkt een regressie te zijn

---

## Bestanden aan te passen

| Bestand | Wijziging |
|---------|-----------|
| `supabase/functions/whatsapp-bridge/index.ts` | Veld mapping fix + debug logging |

---

## Verwacht Resultaat

Na de fix:
- Nieuwe groepsberichten tonen de afzender naam boven het bericht
- `sender_jid` bevat het individuele telefoonnummer van de afzender
- `sender_name` bevat de pushName/displayName

---

## Samenvatting

| Issue | Locatie | Actie |
|-------|---------|-------|
| Veld mapping mismatch | Lovable | Fix in whatsapp-bridge |
| Inconsistente VPS data | VPS | Controleer VPS relay code |

De Lovable-fix kan direct worden geïmplementeerd. Voor de VPS-fix is toegang tot de VPS relay code nodig.

