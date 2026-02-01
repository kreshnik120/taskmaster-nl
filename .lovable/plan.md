

# Bulk Profielfoto Sync - Oplossingsplan

## Huidige Situatie

Er bestaat al een `contact.syncAllProfilePictures` event handler in de whatsapp-bridge die:
- Max 50 contacten zonder foto ophaalt
- Rate limiting toepast (5 requests/seconde)
- VPS aanroept voor elke contact

**Probleem:** De VPS URL is hardcoded en filtert geen ongeldige contacten.

---

## Oplossing

### Stap 1: Fix de syncAllProfilePictures functie

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

**Wijzigingen:**

```typescript
// Regel 1020-1026: Voeg VPS URL toe met fallback
const vpsUrl = Deno.env.get("WHATSAPP_VPS_URL") || Deno.env.get("CLAWDBOT_VPS_URL");
const vpsApiKey = Deno.env.get("WHATSAPP_VPS_API_KEY");
const vpsSessionId = Deno.env.get("WHATSAPP_VPS_SESSION_ID") || "clawdbot-default";

if (!vpsUrl || !vpsApiKey) {
  throw new Error("VPS credentials not configured (WHATSAPP_VPS_URL/CLAWDBOT_VPS_URL)");
}

// Regel 1029-1034: Voeg filter toe voor geldige contacten
const { data: contacts, error } = await supabase
  .from('whatsapp_contacts')
  .select('id, phone_number')
  .eq('org_id', orgId)
  .is('profile_picture_url', null)
  .not('phone_number', 'like', 'group-%')  // Skip groepen
  .neq('phone_number', 'unknown')          // Skip unknown
  .limit(100);  // Verhoog batch naar 100

// Regel 1062: Gebruik dynamische VPS URL
const profilePictureEndpoint = `${vpsUrl}/contacts/${encodeURIComponent(phone)}/profile-picture`;
```

---

### Stap 2: Trigger de sync via API call

Na deployment, trigger de sync:

```bash
curl -X POST "https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/whatsapp-bridge" \
  -H "Content-Type: application/json" \
  -H "x-api-key: [WHATSAPP_VPS_API_KEY]" \
  -d '{
    "event": "contact.syncAllProfilePictures",
    "sessionId": "clawdbot-default",
    "orgId": "550e8400-e29b-41d4-a716-446655440000",
    "data": {}
  }'
```

Of via de Supabase SDK vanuit de app (met auth header).

---

## Technische Details

| Aspect | Waarde |
|--------|--------|
| Rate limit | 5 requests per seconde |
| Batch size | 100 contacten per call |
| Timeout | ~25 seconden voor 100 contacten |
| Herhalingen | Meerdere calls nodig als >100 contacten |

---

## Implementatievolgorde

| # | Actie | Risico |
|---|-------|--------|
| 1 | Update `syncAllProfilePictures` met VPS URL fallback | Laag |
| 2 | Voeg filter toe voor group/unknown contacten | Laag |
| 3 | Deploy edge function | Geen |
| 4 | Trigger sync via curl of browser | Laag |
| 5 | Verificatie: check aantal contacten zonder foto | - |

---

## Verwacht Resultaat

- **51 contacten** worden verwerkt (minus groepen/unknown)
- Foto's worden async opgehaald door VPS
- VPS stuurt `contact.profilePicture` events terug
- Database wordt automatisch bijgewerkt

