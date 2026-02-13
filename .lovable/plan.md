

# BENDY-1: Bendy API Proxy Edge Function

## Overzicht
Maak een nieuwe Supabase Edge Function `bendy-proxy` als veilige proxy tussen abcito.io en de Bendy Planning API. Gebruikt OAuth2 client_credentials flow met token caching, circuit breaker bescherming, en endpoint whitelisting.

## Voorwaarden (Geverifieerd)
- `BENDY_CLIENT_ID` secret: aanwezig
- `BENDY_CLIENT_SECRET` secret: aanwezig
- `_shared/circuit-breaker.ts`: aanwezig met `canExecute`, `recordSuccess`, `recordFailure` exports
- `_shared/core.ts`: aanwezig met alle benodigde utilities

## Wijzigingen

### 1. Nieuw bestand: `supabase/functions/bendy-proxy/index.ts`
Enterprise edge function met:
- JWT authenticatie (in-code validatie via `createAnonClient`)
- OAuth2 client_credentials token ophalen + in-memory cache met expiry margin
- Endpoint whitelist (9 Bendy API v2 endpoints)
- Circuit breaker integratie via `_shared/circuit-breaker.ts`
- Multi-tenant configuratie (citozorg actief, abczorg later)
- 30s request timeout met AbortController
- Token cache invalidatie bij 401 responses

### 2. Config update: `supabase/config.toml`
Toevoegen van `[functions.bendy-proxy]` entry met `verify_jwt = false` (auth in-code)

## Architectuur

```
Browser (abcito.io)
  -> POST /bendy-proxy { endpoint, method, params, body, tenant }
  -> JWT validatie (gebruiker ingelogd?)
  -> Circuit breaker check
  -> OAuth2 token ophalen (cached of nieuw)
  -> Fetch naar Bendy API
  -> Response terug naar browser
```

## Geen wijzigingen aan
- Bestaande edge functions
- `_shared/core.ts` of `_shared/circuit-breaker.ts`
- Frontend componenten, hooks, of pagina's
