

# Fix: Correcte JWT Validatie in WhatsApp Bridge

## Probleem

De huidige JWT verificatie faalt met "Invalid token" omdat de Supabase client verkeerd is geconfigureerd:

```typescript
// HUIDIGE CODE (regel 50-54) - INCOMPLEET
const supabaseAuth = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
  { global: { headers: { Authorization: authHeader! } } }
);
```

**Root cause:** De client probeert de sessie te refreshen/persisteren, wat in Edge Functions niet werkt.

## Oplossing

Voeg de ontbrekende auth configuratie toe:

```typescript
auth: {
  autoRefreshToken: false,
  persistSession: false
}
```

## Wijziging

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

**Regels 48-69 vervangen met:**

```typescript
// If using Supabase Auth, verify the user
let userId: string | null = null;
if (isValidAuth && !isValidApiKey) {
  // Create anon client with user's JWT for verification
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: authHeader! }
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
  
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  
  if (authError || !user) {
    console.error(`[${requestId}] ❌ Auth error:`, authError?.message);
    return new Response(
      JSON.stringify({ success: false, error: "Invalid token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  
  userId = user.id;
  console.log(`[${requestId}] ✅ Authenticated: ${user.email}`);
}

console.log(`[${requestId}] ✅ Auth: ${isValidApiKey ? 'API Key' : `User ${userId}`}`);
```

## Waarom dit werkt

| Configuratie | Effect |
|--------------|--------|
| `autoRefreshToken: false` | Voorkomt refresh attempts in stateless omgeving |
| `persistSession: false` | Voorkomt storage errors (geen localStorage in Deno) |
| `Authorization` header | Stuurt JWT mee voor validatie |

## Veiligheid

Met deze fix:
- Fake tokens worden geweigerd (401 Invalid token)
- Verlopen tokens worden geweigerd
- Alleen geldige Supabase JWTs worden geaccepteerd
- VPS API key authenticatie blijft werken

## Bestand

| Bestand | Actie |
|---------|-------|
| `supabase/functions/whatsapp-bridge/index.ts` | Fix auth configuratie (regels 48-69) |

