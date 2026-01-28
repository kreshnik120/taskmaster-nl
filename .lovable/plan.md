
# Fix WhatsApp Bridge Error Handling en Database Conflicten

## Analyse van de gevonden problemen

Uit de Edge Function logs blijkt:

| Error | Oorzaak |
|-------|---------|
| `[object Object]` | Supabase error objecten worden niet correct naar strings geconverteerd |
| `duplicate key violates unique constraint "whatsapp_sessions_org_id_phone_number_key"` | De `upsert` in `handleSessionConnected` conflicteert met UNIQUE op `(org_id, phone_number)` |
| DB insert fails in `getOrCreateSession` | Bij bestaande sessie met ander `phone_number` faalt de insert |

## Oplossingen

### 1. Verbeterde Error Handling (catch block)

| Bestand | Regel | Wijziging |
|---------|-------|-----------|
| `supabase/functions/whatsapp-bridge/index.ts` | 169-175 | Verbeterde error serialisatie |

Huidige code:
```typescript
} catch (err: unknown) {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error(`[${requestId}] ❌ Error:`, error);
  // ...
}
```

Verbeterde code:
```typescript
} catch (err: unknown) {
  let errorMessage = "Internal server error";
  
  if (err instanceof Error) {
    errorMessage = err.message;
  } else if (typeof err === 'object' && err !== null) {
    // Supabase error objects
    const supaErr = err as { message?: string; code?: string; details?: string };
    errorMessage = supaErr.message || supaErr.details || JSON.stringify(err);
  } else {
    errorMessage = String(err);
  }
  
  console.error(`[${requestId}] ❌ Error: ${errorMessage}`, JSON.stringify(err));
  return new Response(
    JSON.stringify({ success: false, error: errorMessage }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

### 2. Helper functie voor error formatting

Voeg een nieuwe helper functie toe bovenaan:

```typescript
function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'object' && err !== null) {
    const e = err as { message?: string; code?: string; details?: string };
    return e.message || e.details || JSON.stringify(err);
  }
  return String(err);
}
```

### 3. Fix `getOrCreateSession` - gebruik upsert

| Bestand | Regel | Wijziging |
|---------|-------|-----------|
| `supabase/functions/whatsapp-bridge/index.ts` | 557-587 | Gebruik `upsert` met correcte conflict handling |

Probleem: De huidige code doet eerst een `select`, dan een `insert`. Dit faalt als de sessie bestaat maar met een ander phone_number.

Oplossing:
```typescript
async function getOrCreateSession(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  requestId: string
) {
  // First try to find by ID
  const { data: existing } = await supabase
    .from("whatsapp_sessions")
    .select("id, phone_number")
    .eq("id", sessionId)
    .single();

  if (existing) return existing;

  // Use upsert with ID conflict - this handles race conditions
  console.log(`[${requestId}] Creating new session: ${sessionId}`);
  const { data: newSession, error } = await supabase
    .from("whatsapp_sessions")
    .upsert({
      id: sessionId,
      org_id: orgId,
      phone_number: "unknown",
      session_status: "connected",
    }, { 
      onConflict: "id",
      ignoreDuplicates: false 
    })
    .select("id, phone_number")
    .single();

  if (error) {
    throw new Error(`Session creation failed: ${formatError(error)}`);
  }
  return newSession;
}
```

### 4. Fix `handleSessionConnected` - handle duplicate phone_number

Het probleem is dat er een UNIQUE constraint is op `(org_id, phone_number)`. Als dezelfde telefoon reconnect met een nieuwe session ID, faalt de upsert.

Oplossing: Eerst checken of er al een sessie bestaat met dit phone_number, en die updaten of een nieuwe aanmaken:

```typescript
async function handleSessionConnected(
  supabase: SupabaseClientAny,
  sessionId: string,
  orgId: string,
  data: Record<string, unknown>,
  requestId: string
): Promise<Record<string, unknown>> {
  const { phoneNumber } = data as { phoneNumber?: string };

  console.log(`[${requestId}] Session connected: ${sessionId}, phone: ${phoneNumber || 'unknown'}`);

  // First, check if session with this ID already exists
  const { data: existingById } = await supabase
    .from("whatsapp_sessions")
    .select("id")
    .eq("id", sessionId)
    .single();

  if (existingById) {
    // Update existing session
    const { error: updateError } = await supabase
      .from("whatsapp_sessions")
      .update({
        session_status: "connected",
        phone_number: phoneNumber || "unknown",
        session_data: null,
      })
      .eq("id", sessionId);

    if (updateError) {
      throw new Error(`Session update failed: ${formatError(updateError)}`);
    }
    return { sessionId, status: "connected" };
  }

  // If phone_number provided, check for existing session with same phone
  if (phoneNumber) {
    const { data: existingByPhone } = await supabase
      .from("whatsapp_sessions")
      .select("id")
      .eq("org_id", orgId)
      .eq("phone_number", phoneNumber)
      .single();

    if (existingByPhone) {
      // Update existing session with new ID
      const { error: updateError } = await supabase
        .from("whatsapp_sessions")
        .update({
          id: sessionId,
          session_status: "connected",
          session_data: null,
        })
        .eq("id", existingByPhone.id);

      if (updateError) {
        throw new Error(`Session update failed: ${formatError(updateError)}`);
      }
      return { sessionId, status: "connected" };
    }
  }

  // Create new session
  const { data: session, error } = await supabase
    .from("whatsapp_sessions")
    .insert({
      id: sessionId,
      org_id: orgId,
      phone_number: phoneNumber || "unknown",
      session_status: "connected",
      session_data: null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Session creation failed: ${formatError(error)}`);
  }

  return { sessionId: session.id, status: "connected" };
}
```

### 5. Update alle helper functies met betere error handling

Alle `throw error` statements in helper functies moeten worden aangepast:

```typescript
// In getOrCreateContact
if (error) throw new Error(`Contact creation failed: ${formatError(error)}`);

// In getOrCreateChat
if (error) throw new Error(`Chat creation failed: ${formatError(error)}`);
```

## Samenvatting van wijzigingen

| Component | Wijziging |
|-----------|-----------|
| Error handler (catch block) | Supabase errors correct serialiseren naar leesbare strings |
| `formatError()` helper | Nieuwe functie voor consistente error formatting |
| `getOrCreateSession()` | Betere upsert met expliciete error messages |
| `handleSessionConnected()` | Handle duplicate phone_number constraint correct |
| Alle helper functies | Wrap errors in `new Error()` met leesbare messages |

## Verwacht resultaat

Na deze wijzigingen:
- Logs tonen leesbare error messages in plaats van `[object Object]`
- `session.connected` events werken correct, ook bij reconnects
- `message.received` events worden correct verwerkt zonder crashes
