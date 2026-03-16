

# BENDY-REQ-8C: Verwijder no_match diagnostiek

## Wijzigingen in `bendy-sync-requisitions.ts`

### 1. Verwijder declaraties (regel 358-360)
Verwijder `noMatchDiagSamples`, `noMatchUniqueUsers`, `noMatchSamples` — deze drie variabelen.

### 2. Vereenvoudig no-match paden (regels 370-380 en 384-394)
In beide `if (!userBendyId)` en `if (!prof)` blokken: behoud `twStats.noMatch++` en `continue`, verwijder alle regels die `noMatchUniqueUsers`, `noMatchDiagSamples`, `noMatchSamples` en `logInfo` no-match samples vullen.

### 3. Verwijder uit metadata (regels 479-481)
Verwijder deze drie regels:
- `debug_no_match_sample: noMatchDiagSamples`
- `debug_no_match_unique_users: noMatchUniqueUsers.size`
- `debug_no_match_user_ids: [...noMatchUniqueUsers].slice(0, 50)`

### 4. Deploy edge function

## Resultaat
- Metadata bevat nog steeds `toewijzingen_no_match` (de teller)
- Geen `debug_no_match_*` velden meer

