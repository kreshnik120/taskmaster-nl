

# BENDY-REQ-5B-FIX-3: flex_user_companies endpoint bestaat niet (404)

## Root Cause Gevonden

De edge function logs tonen het probleem:

```text
WARNING: Bendy API 404: {"status":404,"error":"Not Found"}
```

**`/api/v2/flex_user_companies` bestaat niet als Bendy API endpoint.** Daarom is fucMap altijd 0.

De fallback via `bendy_raw_cache` werkt ook niet omdat users geen `flex_user_companies` relatie-data in hun raw_data hebben.

## Analyse: Wat we WEL weten

- Assigned requisitions hebben een `flex_user_company` relationship met een ID (60 unieke IDs)
- No-match samples tonen: `fucId=362965`, `fucId=387130`, `fucId=349577`
- De Bendy API heeft `/api/v2/users` (die werkt) met `include=company`
- Users worden gesynchroniseerd naar `professionals` met `bendy_id`

## Nieuwe Strategie: Reverse lookup via users

In plaats van flex_user_companies apart op te halen, bouwen we de mapping **omgekeerd**:

1. Users in Bendy hebben een `company` relatie (we fetchen al `include=company`)
2. Een flex_user_company koppelt een user aan een company
3. We kunnen de mapping bouwen vanuit de `bendy_raw_cache` users die WEL `company` data hebben

**Maar**: de flex_user_company ID ≠ company ID. Het is een koppeltabel-record.

## Alternatief: Fetch individuele flex_user_company records

De Bendy API heeft mogelijk wel `/api/v2/flex_user_companies/{id}` (individueel). We kunnen de 60 unieke IDs individueel ophalen.

## Aanbevolen aanpak

### Wijziging 1: Probeer individuele FUC fetch (`bendy-sync/index.ts`)

Vervang de bulk `/api/v2/flex_user_companies` fetch door individuele fetches voor de 60 unieke IDs:

```text
for each fucId in fucIds (max 60):
  GET /api/v2/flex_user_companies/{fucId}?include=user
  → extract user relationship → fucMap.set(fucId, userId)
```

Met rate limiting (max 5 parallel) en error handling per request.

### Wijziging 2: Fallback — voeg `include=flex_user_company` terug op assigned

Als individuele fetch ook faalt, probeer de assigned fetch opnieuw MET `include=flex_user_company` en log de volledige included array structuur voor diagnose.

### Wijziging 3: Verwijder duplicate code blokken

De FIX-2 edit heeft duplicate "Optie A" en "Optie B" blokken achtergelaten (regels 1968-1988 EN 2015-2035). Opruimen.

### Wijziging 4: Debug metadata uitbreiden

Voeg toe aan metadata:
- `debug_fuc_api_error`: de 404 error message
- `debug_fuc_individual_success`: hoeveel individuele fetches slaagden
- `debug_fuc_individual_failed`: hoeveel faalden

### Niet aanraken
- Overlap trigger, cleanup, frontend, database schema, andere syncs

