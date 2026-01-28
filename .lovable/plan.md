

# Plan: WhatsApp Bridge API Key Creatie

## Overzicht

Dit plan creëert een dedicated API key voor de WhatsApp Bridge integratie, gescheiden van de algemene CITOZORG_API_KEY.

---

## Stappen

### 1. Nieuwe API Key Genereren

Ik genereer een cryptografisch veilige 64-karakter hexadecimale key:

```
wa_bridge_f8c2e9a7d3b1054e6f9c8a2b5d7e0f3a1b4c6d8e9f0a2b3c4d5e6f7a8b9c0d1e
```

*(Format: `wa_bridge_` prefix + 64 hex karakters voor identificatie)*

---

### 2. Secret Toevoegen

Voeg nieuwe secret toe aan Supabase:
- **Naam:** `WHATSAPP_BRIDGE_API_KEY`
- **Waarde:** De gegenereerde key

---

### 3. Edge Function Updaten

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

**Wijziging (regel 34):**

```typescript
// VAN:
const expectedKey = Deno.env.get("CITOZORG_API_KEY");

// NAAR:
const expectedKey = Deno.env.get("WHATSAPP_BRIDGE_API_KEY");
```

---

### 4. Gegevens voor VPS Configuratie

Na implementatie krijg je:

| Item | Waarde |
|------|--------|
| **API Key** | `wa_bridge_f8c2e9a7d3b1054e6f9c8a2b5d7e0f3a1b4c6d8e9f0a2b3c4d5e6f7a8b9c0d1e` |
| **Test org_id (ABCzorg)** | `550e8400-e29b-41d4-a716-446655440000` |
| **Test org_id (CitoZorg)** | `650e8400-e29b-41d4-a716-446655440001` |
| **Endpoint** | `https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/whatsapp-bridge` |

---

### 5. VPS Test Command

```bash
curl -X POST \
  'https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/whatsapp-bridge' \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: wa_bridge_f8c2e9a7d3b1054e6f9c8a2b5d7e0f3a1b4c6d8e9f0a2b3c4d5e6f7a8b9c0d1e' \
  -d '{
    "event": "session.connected",
    "sessionId": "test-session-001",
    "orgId": "550e8400-e29b-41d4-a716-446655440000",
    "data": {
      "phoneNumber": "+31612345678"
    }
  }'
```

---

## Wijzigingen Samenvatting

| # | Actie | Details |
|---|-------|---------|
| 1 | Secret toevoegen | `WHATSAPP_BRIDGE_API_KEY` |
| 2 | Edge function update | 1 regel wijzigen (regel 34) |

**Impact:** Alleen de WhatsApp Bridge gebruikt deze nieuwe key. Andere functies die CITOZORG_API_KEY gebruiken blijven werken.

---

## Acceptatie Criteria

- [ ] Nieuwe secret `WHATSAPP_BRIDGE_API_KEY` bestaat
- [ ] Edge function gebruikt nieuwe key
- [ ] Test curl command retourneert success
- [ ] Oude CITOZORG_API_KEY blijft bestaan (voor andere functies)

