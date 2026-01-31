

## BUG FIX #2: Berichten positionering - sender_type mismatch

### Root Cause Analyse

**Probleem gevonden!** De `WhatsAppMessageBubble` component verwacht `sender_type === 'self'`, maar de database gebruikt `'user'` voor eigen berichten:

| Database waarde | Component verwacht | Resultaat |
|-----------------|-------------------|-----------|
| `'contact'` | `'contact'` | ✅ Correct (links) |
| `'user'` | `'self'` | ❌ **MISMATCH** (wordt links i.p.v. rechts) |

**Code die faalt (regel 25 in WhatsAppMessageBubble.tsx):**
```tsx
const isOutgoing = message.sender_type === 'self';  // 'self' komt nooit voor!
```

---

### Oplossing

**Bestand:** `src/components/whatsapp/WhatsAppMessageBubble.tsx`

#### Wijziging

Update de isOutgoing check om zowel `'self'` als `'user'` te accepteren:

```tsx
// Regel 25: van
const isOutgoing = message.sender_type === 'self';

// Naar
const isOutgoing = message.sender_type === 'self' || message.sender_type === 'user';
```

---

### Alternatieve Aanpak

Optioneel kunnen we ook het type in `src/types/whatsapp.ts` updaten voor documentatie clarity (regel 63):

```tsx
// Huidige definitie
sender_type: 'contact' | 'self' | 'user';

// Commentaar toevoegen voor clarity
sender_type: 'contact' | 'self' | 'user';  // 'user' en 'self' = outgoing berichten
```

---

### Technische Details

| Aspect | Details |
|--------|---------|
| Root cause | Code check op `'self'` maar DB bevat `'user'` |
| Fix | Accept beide waarden als "outgoing" |
| Impact | Alleen styling, geen data wijzigingen |

---

### Resultaat na fix

- `sender_type: 'contact'` → LINKS, witte bubble met border
- `sender_type: 'user'` → RECHTS, groene bubble (#dcf8c6)
- `sender_type: 'self'` → RECHTS, groene bubble (backwards compatible)

