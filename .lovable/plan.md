

# PA-1 -- Smart Matching Engine: AI Suggesties bij Diensten

## Overzicht
Voeg een intelligent matching systeem toe aan de Planning module. Wanneer een planner een dienst opent in het DienstDetailSheet, toont het systeem automatisch de top-10 best passende beschikbare professionals met een 100-punten matchscore.

## Stap 1: Nieuwe Hook -- useDienstMatching.ts

Nieuw bestand `src/hooks/useDienstMatching.ts`:

- **3 parallelle queries**:
  1. Actieve professionals voor de org (`professionals` tabel, max 200)
  2. Beschikbaarheid op de dienstdatum (`professional_availability`)
  3. Bestaande toewijzingen op die datum (`dienst_toewijzingen` met inner join op `diensten`)

- **Client-side scoring** (100 punten max):
  - Functieniveau (0-30): exact match met `gevraagd_functie_niveau`
  - Beschikbaarheid (0-25): via SHIFT_MAP (dag->dag/hele_dag, etc.)
  - Certificeringen (0-20): proportioneel aan `vereiste_certificeringen` match
  - Regio (0-15): match op `sublocation.plaats` vs `regio` en `regio_voorkeur`
  - Historie (0-10): placeholder voor toekomstige uitbreiding

- **Filters**: al toegewezen professionals overslaan, gediskwalificeerden (overlap/niet beschikbaar) verbergen
- **Output**: top 10 gesorteerd op score DESC
- Queries alleen actief als dienst niet geannuleerd/voltooid is

## Stap 2: Nieuw Component -- DienstMatchingSuggesties.tsx

Nieuw bestand `src/components/planning/DienstMatchingSuggesties.tsx`:

- **Score cirkel** met kleurcodering: >= 70 emerald, >= 50 amber, < 50 slate
- **Tooltip** met volledige score breakdown (5 categorieen met progress bars)
- **Match reasons** als compacte chips
- **"Toewijzen" knop** per professional
- **Inklapbaar** (standaard open) met Sparkles icoon
- **Violet themakleur** (onderscheid van teal/emerald)
- Verbergt zichzelf bij geannuleerde/voltooide/volledig bezette diensten

## Stap 3: DienstDetailSheet.tsx aanpassen

Wijzigingen aan `src/components/planning/DienstDetailSheet.tsx`:

- Import `DienstMatchingSuggesties` toevoegen (na regel 10)
- `handleSuggestieAssign` functie toevoegen: insert in `dienst_toewijzingen` met status "voorgesteld"
- Suggesties panel invoegen na `ToewijzingenBeheer` (na regel 251)

## Stap 4: agentIntents.ts uitbreiden

Wijzigingen aan `src/lib/agentIntents.ts`:

- **4 nieuwe intents** toevoegen (na `general_query`, voor sluitende `}`):
  - `suggest_professional` (match_agent)
  - `find_replacement` (match_agent)
  - `check_dienst_coverage` (report_agent)
  - `plan_week_diensten` (schedule_agent)

- **2 nieuwe page configs** toevoegen (na `/recruitment`, voor sluitende `}`):
  - `/planning`: primaryAgent "match_agent", 5 intents
  - `/beschikbaarheid`: primaryAgent "schedule_agent", 4 intents

- **6 nieuwe keywords** in `detectIntentFromText`:
  - suggestie, voorstel, vervanging, bezetting, rooster, weekplanning

## Gewijzigde/Nieuwe Bestanden

1. `src/hooks/useDienstMatching.ts` (nieuw) -- matching engine met 3 queries + scoring
2. `src/components/planning/DienstMatchingSuggesties.tsx` (nieuw) -- suggesties UI
3. `src/components/planning/DienstDetailSheet.tsx` (wijzig) -- integratie suggesties panel
4. `src/lib/agentIntents.ts` (wijzig) -- 4 intents + 2 page configs + 6 keywords

## Technische Details

- Scoring gebruikt dezelfde `SHIFT_MAP` als `useBeschikbaarheidIndicator` voor consistentie
- Overlap check vergelijkt `start_tijd`/`eind_tijd` van diensten op dezelfde datum
- `handleSuggestieAssign` gebruikt `dienst_toewijzingen` insert met status "voorgesteld" en valideert via bestaande database trigger `check_dienst_overlap`
- Alle datum-operaties gebruiken `parseISO()`, geen `new Date(string)`
- Geen database migraties nodig

