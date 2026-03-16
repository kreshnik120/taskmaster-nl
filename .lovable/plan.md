

# CORS Hardening: openclaw-proxy

## Wijzigingen in `supabase/functions/openclaw-proxy/index.ts`

### 1. Vervang `corsHeaders` constante (regels 3-6)
Vervang door `ALLOWED_ORIGINS` array + `getCorsHeaders(req)` functie die origin valideert en terugvalt op `abcito.io`.

### 2. Update `jsonResponse` (regels 74-79)
Voeg optionele `req` parameter toe, gebruik `getCorsHeaders(req)` voor CORS headers.

### 3. Update OPTIONS handler (regels 82-83)
Gebruik `getCorsHeaders(req)` in plaats van `corsHeaders`.

### 4. Alle ~50+ `jsonResponse(...)` calls: voeg `req` toe
Elke handler ontvangt `req` niet direct — ze worden aangeroepen vanuit de `switch` in `Deno.serve`. Twee opties:

**Gekozen aanpak**: Maak `req` beschikbaar voor `jsonResponse` zonder elke call aan te passen — sla `req` op in een closure-variabele zodat `jsonResponse` het automatisch kan gebruiken. Dit voorkomt 50+ individuele wijzigingen.

Concreet:
- Verwijder `req` parameter uit `jsonResponse`
- Gebruik een module-level `let currentRequest: Request` die aan het begin van `Deno.serve` wordt gezet
- `getCorsHeaders()` leest `currentRequest` automatisch

Dit is veilig omdat Deno edge functions single-request zijn (geen concurrency binnen één invocation).

### Samenvatting wijzigingen
1. Regels 3-6: `corsHeaders` → `ALLOWED_ORIGINS` + `getCorsHeaders()`
2. Regel 74-79: `jsonResponse` gebruikt `getCorsHeaders()` intern
3. Regel 82-83: OPTIONS handler gebruikt `getCorsHeaders()`
4. Regel 81: `currentRequest = req` toevoegen aan begin van handler
5. Geen wijzigingen aan individuele handler functies of jsonResponse calls

