
# Beschikbaarheid: WeekKalender UI + Mutations + Filters + Legenda

## Overzicht
Bouw de volledige weekkalender UI voor de Beschikbaarheid module bovenop het B-1 fundament. Omvat een mutations hook, toolbar, 3-state cel editor, weekmatrix, filters, legenda, en volledige pagina-integratie.

## Stap 1: Nieuwe Hook -- useBeschikbaarheidMutations.ts

Nieuw bestand `src/hooks/useBeschikbaarheidMutations.ts`:

- **upsertBeschikbaarheid**: Checkt of entry bestaat (select op professional_id + date + shift), update als ja, insert als nee
- **deleteBeschikbaarheid**: Verwijdert entry (zet terug naar "onbekend")
- Beide invalideren `beschikbaarheid-entries` query key na succes
- Toast bij fouten

## Stap 2: BeschikbaarheidToolbar.tsx

Nieuw bestand `src/components/beschikbaarheid/BeschikbaarheidToolbar.tsx`:

- Volgt PlanningToolbar patroon maar zonder view mode toggle
- ChevronLeft/Right voor week navigatie, "Vandaag" knop
- Week label: "Week X -- dd MMM t/m dd MMM yyyy"
- Gebruikt `parseISO` voor weekStart

## Stap 3: BeschikbaarheidCelEditor.tsx

Nieuw bestand `src/components/beschikbaarheid/BeschikbaarheidCelEditor.tsx`:

- Enkele shift-knop (8x8 rounded) met 3-state toggle via klik:
  - Onbekend (slate) -> Beschikbaar (emerald) -> Niet beschikbaar (rose) -> Onbekend
- Labels: D/A/N voor dag/avond/nacht
- Tooltip met shift naam en huidige status
- aria-label voor accessibility

## Stap 4: BeschikbaarheidWeekKalender.tsx

Nieuw bestand `src/components/beschikbaarheid/BeschikbaarheidWeekKalender.tsx`:

- Matrix: professionals (Y-as) x 7 dagen (X-as)
- Elke cel bevat 3 shift-knoppen (D/A/N) via BeschikbaarheidCelEditor
- Sticky eerste kolom met professional naam + functieniveau
- Vandaag-kolom met teal highlight
- Horizontaal scrollbaar op overflow
- Empty state bij geen professionals

## Stap 5: BeschikbaarheidFilters.tsx

Nieuw bestand `src/components/beschikbaarheid/BeschikbaarheidFilters.tsx`:

- Popover met 4 filters: Functieniveau, Werkvorm, Status, Regio
- Badge count voor actieve filters
- Reset knop
- Geen presets (simpeler dan planning)

## Stap 6: BeschikbaarheidLegenda.tsx

Nieuw bestand `src/components/beschikbaarheid/BeschikbaarheidLegenda.tsx`:

- 3 kleur-items: Beschikbaar (emerald), Niet beschikbaar (rose), Onbekend (slate)
- D/A/N shift-uitleg
- Volgt PlanningLegenda patroon

## Stap 7: Beschikbaarheid.tsx -- Volledige vervanging

Vervang de placeholder pagina volledig:

- Importeer alle nieuwe componenten + mutations hook
- `handleWeekChange` via `setSearchParams`
- `handleToggle` callback met 3-state logica: onbekend->beschikbaar->niet->onbekend
- Layout: PageHero -> KPI Cards -> Toolbar + Filters balk -> Legenda -> WeekKalender -> Telling
- Skeleton loading state (5 rijen)
- Telling onderaan: "X professionals weergegeven"

## Gewijzigde/Nieuwe Bestanden
1. `src/hooks/useBeschikbaarheidMutations.ts` (nieuw) -- upsert + delete mutations
2. `src/components/beschikbaarheid/BeschikbaarheidToolbar.tsx` (nieuw) -- week navigatie
3. `src/components/beschikbaarheid/BeschikbaarheidCelEditor.tsx` (nieuw) -- 3-state shift knop
4. `src/components/beschikbaarheid/BeschikbaarheidWeekKalender.tsx` (nieuw) -- matrix
5. `src/components/beschikbaarheid/BeschikbaarheidFilters.tsx` (nieuw) -- filter popover
6. `src/components/beschikbaarheid/BeschikbaarheidLegenda.tsx` (nieuw) -- legenda
7. `src/pages/Beschikbaarheid.tsx` (vervangen) -- volledige pagina integratie
