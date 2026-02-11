

# Prompt #1B — Weekkalender + Filters + KPI's

## Overzicht

De Planning placeholder pagina wordt vervangen door een volledige weekkalender UI met 7 nieuwe componenten, 4 KPI-kaarten, filtersysteem met presets, en een alternatieve lijstweergave.

---

## Nieuwe Bestanden (7 componenten)

### 1. `src/components/planning/DienstStatusBadge.tsx`
- Badge component met 7 statussen: concept, open, deels_bezet, volledig_bezet, voltooid, geannuleerd
- Gebruikt shadcn `Badge variant="outline"` als basis
- `size` prop: "default" | "xs" (kleiner voor compact kaarten)
- Elke status heeft eigen kleuren voor light + dark mode (bijv. open = rose, deels_bezet = amber, volledig_bezet = emerald)
- Geannuleerd krijgt `line-through` tekststijl

### 2. `src/components/planning/DienstCard.tsx`
- Twee modi via `compact` prop (default true)
- Gekleurde linkerrand (`border-l-4`) per status
- **Compact**: Tijd + mini badge, locatienaam (truncated), functieniveau + bezetting ratio
- **Full**: Alle info horizontaal uitgespreid
- Glass morphism: `bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm`
- Geel bolletje indicator als er reacties zijn (toewijzingen met status positief/misschien)
- `onClick` prop voor detail weergave

### 3. `src/components/planning/PlanningLegenda.tsx`
- Horizontale rij met 6 gekleurde indicators (w-2.5 h-2.5 rounded-full)
- Statussen: Open (rose), Deels bezet (amber), Bezet (emerald), Concept (slate), Met reactie (geel), Geannuleerd (grijs)
- Flex-wrap voor mobile

### 4. `src/components/planning/PlanningToolbar.tsx`
- Links: ChevronLeft, "Vandaag" knop, ChevronRight, "Week 7 -- 09-02-2026 t/m 15-02-2026"
- Rechts: View toggle (Kalender | Lijst) met active state
- Props: `weekStart`, `onWeekChange`, `viewMode`, `onViewModeChange`
- date-fns met NL locale, `getISOWeek()` voor weeknummer

### 5. `src/components/planning/PlanningWeekKalender.tsx`
Het kerncomponent met twee secties:
- **Sectie 1 "Openstaande diensten (X)"**: concept + open + deels_bezet, rose/amber accent
- **Sectie 2 "Ingeplande diensten (X, Y uur)"**: volledig_bezet + voltooid, emerald/blue accent
- 7 dagkolommen (ma-zo), vandaag gehighlight met ring-2
- Per kolom: dagnaam + datum + aantal diensten + DienstCards gesorteerd op start_tijd
- Lege dag: streepje "--"
- Data via `splitByStatus()` uit de hook
- Responsive: 1 col (mobile) -> 7 col (desktop) via grid
- `showOpen` en `showIngepland` props om secties te tonen/verbergen

### 6. `src/components/planning/PlanningLijstWeergave.tsx`
- Tabelweergave als alternatief voor kalender
- Kolommen: Datum & Tijd, Locatie, Functie, Bezetting (met mini voortgangsbalk), Status
- Glass morphism tabel container
- Klikbare rijen via `onDienstClick`
- Lege state met Inbox icon

### 7. `src/components/planning/PlanningFilters.tsx`
- Popover met 5 filters: Status, Bureau, Functieniveau, Opdrachtgever (via `useClientOrganizations`), Werkvorm
- Filter presets: opslaan/laden/verwijderen via `dienst_filter_presets` tabel
- Active filter count badge op de trigger knop
- Reset knop om alle filters te wissen

---

## Bestaand Bestand Wijzigen

### `src/pages/Planning.tsx` (volledig vervangen)
- **State**: `weekStart` + `viewMode` in URL via `useSearchParams`, filters in React state, toggles (showOpen, showIngepland, compact)
- **Data**: `useDienstenPlanning(filters)` met dynamische weekStart uit URL
- **Layout**:
  1. `PageHero` met "Nieuwe Dienst" knop (state toggle, modal komt in #1C)
  2. 4 KPI-kaarten in grid via bestaande `KPICard` component:
     - Vandaag (CalendarDays, variant="rose")
     - Deze week (CalendarDays, variant="rose") 
     - Open diensten (AlertCircle, variant="amber")
     - Bezettingsgraad (TrendingUp, variant="emerald", suffix="%")
  3. Filter toggles: Openstaand, Ingepland, Compact (kleine knoppen, altijd zichtbaar)
  4. `PlanningToolbar` (weeknavigatie + view toggle)
  5. `PlanningLegenda`
  6. Conditie: `PlanningWeekKalender` of `PlanningLijstWeergave`
- Skeleton loading state bij `isLoading`

---

## Technisch Overzicht

| Bestand | Actie |
|---------|-------|
| `src/components/planning/DienstStatusBadge.tsx` | Nieuw |
| `src/components/planning/DienstCard.tsx` | Nieuw |
| `src/components/planning/PlanningLegenda.tsx` | Nieuw |
| `src/components/planning/PlanningToolbar.tsx` | Nieuw |
| `src/components/planning/PlanningWeekKalender.tsx` | Nieuw |
| `src/components/planning/PlanningLijstWeergave.tsx` | Nieuw |
| `src/components/planning/PlanningFilters.tsx` | Nieuw |
| `src/pages/Planning.tsx` | Vervangen |

Totaal: 7 nieuwe bestanden + 1 vervangen. Geen database wijzigingen, geen nieuwe hooks (hergebruikt bestaande `useDienstenPlanning`, `useClientOrganizations`, `KPICard`).

