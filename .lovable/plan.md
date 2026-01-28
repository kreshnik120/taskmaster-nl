

# Fix: Dual Authentication voor WhatsApp Bridge

## Probleem

De Edge Function geeft 401 "Invalid API key" omdat:
- VPS webhook calls gebruiken `x-api-key` header
- UI calls via `supabase.functions.invoke()` gebruiken `Authorization: Bearer <token>` header
- Huidige code accepteert alleen `x-api-key`

## Oplossing

Pas de authenticatie aan om beide methodes te ondersteunen:

| Bron | Header | Validatie |
|------|--------|-----------|
| VPS Webhook | `x-api-key` | Vergelijk met `WHATSAPP_BRIDGE_API_KEY` secret |
| UI (Supabase) | `Authorization: Bearer <token>` | Verifieer JWT met `supabase.auth.getUser()` |

## Wijziging

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

**Locatie:** Regels 31-42 (authenticatie sectie)

**Huidige code:**
```typescript
// 1. Validate API Key
const apiKey = req.headers.get("x-api-key");
const expectedKey = Deno.env.get("WHATSAPP_BRIDGE_API_KEY");

if (!apiKey || apiKey !== expectedKey) {
  console.error(`[${requestId}] ❌ Invalid API key`);
  return new Response(
    JSON.stringify({ success: false, error: "Invalid API key" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

**Nieuwe code:**
```typescript
// 1. Validate authentication (API Key OR Supabase Auth)
const apiKey = req.headers.get("x-api-key");
const expectedKey = Deno.env.get("WHATSAPP_BRIDGE_API_KEY");
const authHeader = req.headers.get("Authorization");

const isValidApiKey = apiKey && apiKey === expectedKey;
const isValidAuth = authHeader && authHeader.startsWith("Bearer ");

if (!isValidApiKey && !isValidAuth) {
  console.error(`[${requestId}] ❌ No valid authentication provided`);
  return new Response(
    JSON.stringify({ success: false, error: "Unauthorized" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// If using Supabase Auth, verify the user
if (isValidAuth && !isValidApiKey) {
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  
  if (authError || !user) {
    console.error(`[${requestId}] ❌ Invalid token`);
    return new Response(
      JSON.stringify({ success: false, error: "Invalid token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  
  console.log(`[${requestId}] ✅ Authenticated user: ${user.email}`);
}

console.log(`[${requestId}] ✅ Auth method: ${isValidApiKey ? 'API Key' : 'Supabase Auth'}`);
```

## Flow na wijziging

```text
Request ontvangen
       │
       ▼
┌──────────────────────┐
│ Check x-api-key      │
│ header aanwezig?     │
└──────────────────────┘
       │
   ┌───┴───┐
   ▼       ▼
  Ja      Nee
   │       │
   ▼       ▼
┌─────┐  ┌──────────────────┐
│Match│  │Check Authorization│
│key? │  │header aanwezig?   │
└─────┘  └──────────────────┘
   │           │
  ┌┴┐       ┌──┴──┐
  ▼ ▼       ▼     ▼
 Ja Nee    Ja    Nee
  │  │     │      │
  │  │     ▼      ▼
  │  │  ┌──────┐  ▼
  │  │  │Verify│ 401
  │  │  │JWT   │ Error
  │  │  └──────┘
  │  │     │
  │  │  ┌──┴──┐
  │  │  ▼     ▼
  │  │ Valid Invalid
  │  │  │      │
  ▼  ▼  ▼      ▼
 ✅ 401 ✅    401
```

## Veiligheidsoverwegingen

- VPS calls blijven werken met bestaande API key
- UI calls worden geverifieerd via Supabase JWT
- Geen enkele call komt door zonder geldige authenticatie
- Logging toont welke auth methode werd gebruikt

## Deploy

Na goedkeuring wordt de Edge Function automatisch gedeployed en kun je direct berichten versturen vanuit de UI.

