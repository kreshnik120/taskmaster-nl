
# Fix WhatsApp Bridge Unique Constraint Error (Revisie)

## Probleem Analyse

De vorige fix introduceerde `phone_number: "pending"` maar dit lost het probleem niet op. De database heeft al 2 sessies voor org `550e8400-...`:

| ID | phone_number | status |
|----|--------------|--------|
| `61f4b1fb-...` | `31618710360` | connected |
| `9a8c604c-...` | `unknown` | disconnected |

De constraint `(org_id, phone_number)` wordt geschonden wanneer we een NIEUWE sessie proberen in te voegen met een `phone_number` die al bestaat voor die org.

## Root Cause

De `getOrCreateSession` functie probeert een nieuwe sessie te maken wanneer het geen exacte `sessionId` match vindt, terwijl er al een werkende sessie bestaat voor de organisatie.

## Oplossing

Vereenvoudig de logica: **hergebruik ALTIJD een bestaande sessie voor de org, maak NOOIT een nieuwe aan tenzij er echt geen sessie bestaat.**

### Nieuwe `getOrCreateSession` Logica

```text
1. Zoek sessie op exacte sessionId
   → Gevonden: return sessie
   
2. Zoek ELKE bestaande sessie voor deze org (meest recente eerst)
   → Gevonden: update updated_at en return deze sessie
   
3. Geen sessie bestaat: INSERT nieuwe sessie (zal slagen want geen conflict)
```

### Code Wijzigingen

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

**Wijzig `getOrCreateSession` (regels 661-738):**

```typescript
async function getOrCreateSession(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  requestId: string
) {
  // 1. Try exact sessionId match
  const { data: existingById } = await supabase
    .from("whatsapp_sessions")
    .select("id, phone_number")
    .eq("id", sessionId)
    .maybeSingle();

  if (existingById) {
    console.log(`[${requestId}] Found session by ID: ${sessionId}`);
    return existingById;
  }

  // 2. Find ANY existing session for this org (prefer connected, then by updated_at)
  const { data: existingForOrg } = await supabase
    .from("whatsapp_sessions")
    .select("id, phone_number")
    .eq("org_id", orgId)
    .order("session_status", { ascending: false }) // 'connected' before 'disconnected'
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingForOrg) {
    console.log(`[${requestId}] Reusing org session: ${existingForOrg.id} (phone: ${existingForOrg.phone_number})`);
    // Touch session to mark as active
    await supabase
      .from("whatsapp_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", existingForOrg.id);
    return existingForOrg;
  }

  // 3. No session exists at all - safe to create new one
  console.log(`[${requestId}] Creating first session for org: ${orgId}`);
  
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
    // Race condition: another request created a session, try to find it
    console.log(`[${requestId}] Insert failed (likely race condition), retrying lookup`);
    
    const { data: raceSession } = await supabase
      .from("whatsapp_sessions")
      .select("id, phone_number")
      .eq("org_id", orgId)
      .limit(1)
      .maybeSingle();
    
    if (raceSession) {
      return raceSession;
    }
    
    throw new Error(`Session creation failed: ${formatError(error)}`);
  }

  return newSession;
}
```

## Belangrijke Wijzigingen t.o.v. Vorige Poging

| Aspect | Vorige Poging | Deze Fix |
|--------|---------------|----------|
| Fallback strategie | UPSERT met "pending" | Hergebruik bestaande sessie |
| Session prioriteit | Meest recente | Prefer "connected" status |
| phone_number default | "pending" | "unknown" (origineel) |
| UPSERT logica | Ja | Nee (gewone INSERT) |

## Waarom Dit Werkt

1. **Stap 1**: Exacte `sessionId` match (snelle path)
2. **Stap 2**: Als de VPS een andere sessionId stuurt, hergebruiken we de bestaande org sessie
3. **Stap 3**: INSERT alleen als er echt geen sessie is (eerste keer, geen conflict mogelijk)
4. **Race condition**: Als INSERT faalt, zoeken we opnieuw (andere request was sneller)

## Te Wijzigen Bestand

| Bestand | Regels | Actie |
|---------|--------|-------|
| `supabase/functions/whatsapp-bridge/index.ts` | 661-738 | Vervang `getOrCreateSession` functie |

## Test Na Fix

1. Stuur WhatsApp bericht naar `+31618710360`
2. Check Edge Function logs - geen constraint errors
3. Bericht verschijnt in `/whatsapp` UI

## Geen Wijzigingen Aan

- Database schema
- `handleSessionConnected` (heeft eigen robuuste logica)
- Frontend componenten
- Andere handlers
