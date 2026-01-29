
# Fix WhatsApp Bridge Unique Constraint Error

## Probleem Analyse

De edge function `whatsapp-bridge` geeft een foutmelding:
```
duplicate key violates unique constraint whatsapp_sessions_org_id_phone_number_key
```

### Root Cause
De `getOrCreateSession` functie (regels 661-727) heeft een race condition/logica probleem:

```text
Huidige Flow:
1. Zoek sessie op sessionId → niet gevonden
2. Zoek sessie met org_id + phone_number="unknown" → gevonden
3. Delete oude sessie
4. Insert nieuwe sessie met phone_number="unknown"
   ↳ PROBLEEM: Tussen delete en insert kan andere request ook inserten
   ↳ PROBLEEM: Insert kan falen als phone_number al gebruikt wordt
```

### Database Constraint
| Index | Kolommen |
|-------|----------|
| `whatsapp_sessions_org_id_phone_number_key` | `(org_id, phone_number)` |

### Huidige Sessies in DB
| ID | phone_number | status |
|----|--------------|--------|
| `9a8c604c-...` | `unknown` | disconnected |
| `61f4b1fb-...` | `31618710360` | connected |

## Oplossing

Vervang de huidige `getOrCreateSession` logica met een **UPSERT pattern** die:
1. Eerst probeert te vinden op `session_id` (primaire lookup)
2. Dan probeert te vinden op `org_id` (fallback - pak meest recente actieve sessie)
3. Als geen sessie bestaat, maak nieuwe met UPSERT op `(org_id, phone_number)`

### Nieuwe Flow

```text
Nieuwe Flow (fail-safe):
1. SELECT * FROM whatsapp_sessions WHERE id = $sessionId
   → Als gevonden: return sessie
   
2. SELECT * FROM whatsapp_sessions WHERE org_id = $orgId 
   ORDER BY updated_at DESC LIMIT 1
   → Als gevonden: return meest recente sessie (hergebruik bestaande)
   
3. INSERT INTO whatsapp_sessions (...) 
   ON CONFLICT (org_id, phone_number) DO UPDATE SET updated_at = NOW()
   → Atomaire operatie, geen race condition
```

### Code Wijziging

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

**Wijzig functie `getOrCreateSession` (regels 661-727):**

```typescript
async function getOrCreateSession(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  requestId: string
) {
  // 1. Try to find existing session by ID (exact match)
  const { data: existingById } = await supabase
    .from("whatsapp_sessions")
    .select("id, phone_number")
    .eq("id", sessionId)
    .single();

  if (existingById) {
    console.log(`[${requestId}] Found session by ID: ${sessionId}`);
    return existingById;
  }

  // 2. Find any session for this org (fallback - use existing session)
  const { data: existingByOrg } = await supabase
    .from("whatsapp_sessions")
    .select("id, phone_number")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingByOrg) {
    console.log(`[${requestId}] Using existing org session: ${existingByOrg.id} (requested: ${sessionId})`);
    // Update the session to mark it as recently used
    await supabase
      .from("whatsapp_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", existingByOrg.id);
    return existingByOrg;
  }

  // 3. No session exists - create with UPSERT to handle race conditions
  console.log(`[${requestId}] Creating new session for org: ${orgId}`);
  
  const { data: newSession, error } = await supabase
    .from("whatsapp_sessions")
    .upsert(
      {
        id: sessionId,
        org_id: orgId,
        phone_number: "pending", // Use "pending" instead of "unknown" for new sessions
        session_status: "connected",
        updated_at: new Date().toISOString(),
      },
      { 
        onConflict: "org_id,phone_number",
        ignoreDuplicates: false 
      }
    )
    .select("id, phone_number")
    .single();

  if (error) {
    // If upsert fails, try one more time to find existing session
    console.log(`[${requestId}] Upsert failed, retrying lookup: ${error.message}`);
    
    const { data: retrySession } = await supabase
      .from("whatsapp_sessions")
      .select("id, phone_number")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();
    
    if (retrySession) {
      return retrySession;
    }
    
    throw new Error(`Session creation failed: ${formatError(error)}`);
  }

  return newSession;
}
```

## Samenvatting Wijzigingen

| Aspect | Oud | Nieuw |
|--------|-----|-------|
| **Lookup 1** | Alleen op `session_id` | Op `session_id` |
| **Lookup 2** | Alleen `phone_number="unknown"` | Alle sessies van org (meest recente) |
| **Create** | Gewone INSERT | UPSERT met ON CONFLICT |
| **phone_number default** | `"unknown"` | `"pending"` |
| **Race condition** | ❌ Mogelijk | ✅ Afgehandeld |

## Te Wijzigen Bestand

| Bestand | Regels | Actie |
|---------|--------|-------|
| `supabase/functions/whatsapp-bridge/index.ts` | 661-727 | Vervang `getOrCreateSession` functie |

## Test Na Implementatie

1. Stuur een WhatsApp bericht naar `+31618710360`
2. Check Edge Function logs voor errors
3. Controleer of bericht verschijnt in `/whatsapp` UI

## Geen Wijzigingen Aan

- Database schema (constraint blijft)
- Andere event handlers
- Frontend WhatsApp componenten
- Andere Edge Functions
