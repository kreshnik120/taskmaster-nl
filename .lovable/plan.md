

# Update openclaw-proxy: OPENCLAW_API_KEY

Eenvoudige wijziging in één bestand:

**Bestand:** `supabase/functions/openclaw-proxy/index.ts` (regel 35)

Wijzig:
```typescript
const expectedKey = Deno.env.get("CITOZORG_API_KEY");
```
naar:
```typescript
const expectedKey = Deno.env.get("OPENCLAW_API_KEY");
```

Daarna direct deployen. Geen andere bestanden worden geraakt.

