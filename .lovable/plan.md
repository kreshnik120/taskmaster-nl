

# Fix: WhatsApp Bridge Error Handling & VPS Sessie

## Huidige status

De **authenticatie is nu correct** - beide methodes werken:
- API Key authenticatie: `✅ Auth: API Key`
- JWT authenticatie: `✅ Authenticated: k.atashi@citozorg.nl`

## Gevonden problemen

### Probleem 1: VPS "Session not found" (geen code fix nodig)

```
VPS error: 500 - {"error":"Session not found"}
```

De WhatsApp sessie op de VPS server is niet actief. De `WHATSAPP_VPS_SESSION_ID` verwijst naar een sessie die:
- Niet bestaat
- Is verlopen
- WhatsApp is uitgelogd

**Actie:** De VPS moet opnieuw worden verbonden met WhatsApp Web. Dit is een operationele taak, geen code fix.

### Probleem 2: "[object Object]" error in handleSessionConnected

De error handling gooit database errors als object in plaats van als Error, waardoor de foutmelding onduidelijk is.

**Locatie:** `supabase/functions/whatsapp-bridge/index.ts` regel 346

**Huidige code:**
```typescript
if (error) throw error;  // error is een object, geen Error
```

**Fix:** Verbeter error handling om database errors correct te verwerken:

```typescript
if (error) {
  console.error(`[${requestId}] DB error:`, JSON.stringify(error));
  throw new Error(`Database error: ${error.message || error.code || 'Unknown'}`);
}
```

## Wijzigingen

| Bestand | Regel | Actie |
|---------|-------|-------|
| `supabase/functions/whatsapp-bridge/index.ts` | 346, 362, 393 | Fix error handling in alle handlers |

## Volledige wijzigingen

### handleSessionConnected (regel 346)

```typescript
// Oud:
if (error) throw error;

// Nieuw:
if (error) {
  console.error(`[${requestId}] DB error:`, JSON.stringify(error));
  throw new Error(`Database error: ${error.message || error.code || 'Unknown'}`);
}
```

### handleSessionDisconnected (regel 362)

```typescript
// Oud:
if (error) throw error;

// Nieuw:
if (error) {
  console.error(`[${requestId}] DB error:`, JSON.stringify(error));
  throw new Error(`Database error: ${error.message || error.code || 'Unknown'}`);
}
```

### handleSessionQR (regel 393)

```typescript
// Oud:
if (error) throw error;

// Nieuw:
if (error) {
  console.error(`[${requestId}] DB error:`, JSON.stringify(error));
  throw new Error(`Database error: ${error.message || error.code || 'Unknown'}`);
}
```

## Samenvatting

1. **Authenticatie:** Werkt correct
2. **Error handling:** Kleine code fix nodig voor duidelijkere foutmeldingen
3. **VPS Sessie:** Moet opnieuw worden verbonden (operationele actie, niet in Lovable)

