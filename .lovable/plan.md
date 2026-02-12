

# PA-2 -- Server-Side Matching Engine: Edge Function + Historie Score

## Overzicht
Voeg een server-side matching engine toe via een backend function die een ECHTE historie score berekent (hoeveel keer een professional eerder bij dezelfde opdrachtgever heeft gewerkt). De client-side matching (PA-1) geeft historie altijd 0 punten. Een "Diepere analyse" knop in de UI triggert de server-side analyse.

## Stap 1: Edge Function -- agent-dienst-matching/index.ts

Nieuw bestand `supabase/functions/agent-dienst-matching/index.ts`:

- Importeert `corsHeaders`, `createAdminClient`, `jsonResponse`, `handleCors`, `logInfo`, `logSuccess`, `logError` uit `_shared/core.ts`
- **6 database queries**:
  1. Dienst ophalen met sublocation/location/organization (voor client_org_id)
  2. Actieve professionals (org_id, actief/beschikbaar, max 200)
  3. Beschikbaarheid op datum
  4. Dag-toewijzingen voor overlap check
  5. Huidige toewijzingen aan deze dienst (skip lijst)
  6. **HISTORIE**: eerdere bevestigde/voltooide toewijzingen bij dezelfde opdrachtgever (client_org_id)
- **Scoring** (zelfde 100-punten systeem als client-side):
  - Functieniveau (0-30), Beschikbaarheid (0-25), Certificeringen (0-20), Regio (0-15)
  - **Historie (0-10) -- NIEUW**: >=5x eerder = 10pt, >=2x = 7pt, 1x = 4pt, 0x = 0pt
- Logging naar `function_call_logs` tabel
- Return: `{ success, action, matches, meta }`

## Stap 2: Config.toml entry

Voeg `[functions.agent-dienst-matching]` toe met `verify_jwt = false` aan `supabase/config.toml`.

## Stap 3: Frontend Hook -- useAgentDienstMatching.ts

Nieuw bestand `src/hooks/useAgentDienstMatching.ts`:

- `supabase.functions.invoke("agent-dienst-matching", { body })` aanroep
- State: `isAnalyzing`, `agentMatches`, `executionTime`, `error`
- `runAnalysis(dienst, action)` -- trigger server-side analyse
- `clearResults()` -- reset state

## Stap 4: DienstMatchingSuggesties.tsx uitbreiden

Wijzigingen aan `src/components/planning/DienstMatchingSuggesties.tsx`:

- Import `useAgentDienstMatching` + `Loader2` + `Zap` iconen
- Voeg agent hook state toe in de component
- Voeg "Diepere analyse (met werkhistorie)" knop toe onder de client-side resultaten:
  - Zap icoon, violet outline stijl
  - Loading state met Loader2 spinner
  - Bij resultaten: server-side matches tonen met historie score highlight
  - "Sluiten" knop om agent resultaten te verbergen
  - Toewijzen knop per agent match
  - Error weergave bij fouten

## Gewijzigde/Nieuwe Bestanden

1. `supabase/functions/agent-dienst-matching/index.ts` (nieuw) -- server-side matching engine
2. `supabase/config.toml` (wijzig) -- function config entry
3. `src/hooks/useAgentDienstMatching.ts` (nieuw) -- frontend hook voor edge function
4. `src/components/planning/DienstMatchingSuggesties.tsx` (wijzig) -- "Diepere analyse" knop + resultaten UI

## Technische Details

- Edge function gebruikt `createAdminClient()` (service role) voor volledige data toegang
- Historie query haalt alle bevestigde/voltooide toewijzingen op en filtert client-side op `client_org_id` match
- Geen database migraties nodig (`function_call_logs` tabel bestaat al)
- Config.toml: `verify_jwt = false` (auth wordt niet vereist voor deze matching operatie)

