

# Fix: Expliciete JWT Token aan getUser() meegeven

## Probleem

De Edge Function logs tonen:
```
[6688e2e6] ❌ Auth error: Auth session missing!
```

**Root cause:** De huidige code roept `supabaseAuth.auth.getUser()` aan zonder argument. In een stateless Edge Function omgeving is er geen "sessie" - de JWT moet **expliciet** worden meegegeven.

## Huidige code (regel 66)

```typescript
const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
```

Dit zoekt naar een bestaande sessie, die er niet is in Deno.

## Oplossing

Geef de JWT token direct mee aan `getUser()`:

```typescript
const token = authHeader!.replace('Bearer ', '');
const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
```

## Volledige wijziging

**Bestand:** `supabase/functions/whatsapp-bridge/index.ts`

**Regels 64-66 worden:**

```typescript
      );
      
      const token = authHeader!.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
```

## Waarom dit werkt

| Methode | Gedrag |
|---------|--------|
| `getUser()` (zonder arg) | Zoekt naar actieve sessie → "Auth session missing!" in stateless omgeving |
| `getUser(token)` | Valideert de meegegeven JWT → Werkt in Edge Functions |

## Alternatieve optie

Als `getUser(token)` nog steeds problemen geeft, kun je ook `getClaims(token)` gebruiken:

```typescript
const token = authHeader!.replace('Bearer ', '');
const { data, error: authError } = await supabaseAuth.auth.getClaims(token);

if (authError || !data?.claims) {
  return new Response(..., { status: 401 });
}

const userId = data.claims.sub;
const userEmail = data.claims.email;
```

Dit is de aanbevolen methode voor Edge Functions volgens de Supabase documentatie.

## Bestand

| Bestand | Actie |
|---------|-------|
| `supabase/functions/whatsapp-bridge/index.ts` | Regel 66: voeg token argument toe aan getUser() |

