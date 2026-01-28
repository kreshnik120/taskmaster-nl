
# Fix WhatsApp Bridge Session Duplicate Key Error

## Probleem

De `getOrCreateSession` helper functie faalt met:
```
duplicate key value violates unique constraint "whatsapp_sessions_org_id_phone_number_key"
```

**Root cause**: De functie zoekt alleen op `sessionId`, maar de UNIQUE constraint is op `(org_id, phone_number)`. Wanneer een nieuwe sessie binnenkomt met `phone_number: "unknown"`, maar er al een sessie bestaat voor dezelfde org met `phone_number: "unknown"`, faalt de INSERT.

**Database staat nu:**
| id | org_id | phone_number | status |
|----|--------|--------------|--------|
| 9a8c604c-... | 550e8400-... | unknown | disconnected |
| 63ffeb3c-... | 550e8400-... | 31618710360 | disconnected |

## Oplossing

Update `getOrCreateSession` om:
1. Eerst te zoeken op `sessionId` (bestaande logica)
2. Als niet gevonden: zoek op `org_id + phone_number = "unknown"`
3. Als gevonden: update die bestaande sessie met de nieuwe `sessionId`
4. Als niet gevonden: maak een nieuwe sessie aan

## Technische wijziging

| Bestand | Wijziging |
|---------|-----------|
| `supabase/functions/whatsapp-bridge/index.ts` | Update `getOrCreateSession` helper (regels 661-693) |

**Nieuwe implementatie:**

```typescript
async function getOrCreateSession(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  requestId: string
) {
  // 1. Try to find existing session by ID
  const { data: existing } = await supabase
    .from("whatsapp_sessions")
    .select("id, phone_number")
    .eq("id", sessionId)
    .single();

  if (existing) return existing;

  // 2. Check if there's an existing session with same org_id and phone_number="unknown"
  const { data: existingUnknown } = await supabase
    .from("whatsapp_sessions")
    .select("id, phone_number")
    .eq("org_id", orgId)
    .eq("phone_number", "unknown")
    .single();

  if (existingUnknown) {
    // Update the existing session with new ID
    console.log(`[${requestId}] Updating existing unknown session: ${existingUnknown.id} -> ${sessionId}`);
    
    // Delete old session first, then create new one (can't update primary key)
    await supabase
      .from("whatsapp_sessions")
      .delete()
      .eq("id", existingUnknown.id);
    
    const { data: newSession, error } = await supabase
      .from("whatsapp_sessions")
      .insert({
        id: sessionId,
        org_id: orgId,
        phone_number: "unknown",
        session_status: "connected",
      })
      .select("id, phone_number")
      .single();

    if (error) {
      throw new Error(`Session creation failed: ${formatError(error)}`);
    }
    return newSession;
  }

  // 3. Create new session
  console.log(`[${requestId}] Creating new session: ${sessionId}`);
  const { data: newSession, error } = await supabase
    .from("whatsapp_sessions")
    .insert({
      id: sessionId,
      org_id: orgId,
      phone_number: "unknown",
      session_status: "connected",
    })
    .select("id, phone_number")
    .single();

  if (error) {
    throw new Error(`Session creation failed: ${formatError(error)}`);
  }
  return newSession;
}
```

## Samenvatting

| Stap | Actie |
|------|-------|
| 1 | Check of sessie bestaat met `sessionId` |
| 2 | Check of sessie bestaat met `org_id` + `phone_number="unknown"` |
| 3 | Als ja: vervang die sessie met nieuwe `sessionId` |
| 4 | Als nee: maak nieuwe sessie |

## Verwacht resultaat

- Geen duplicate key errors meer bij `message.received` events
- Bestaande "unknown" sessies worden hergebruikt/vervangen
- Sessies met echte phone numbers blijven intact
