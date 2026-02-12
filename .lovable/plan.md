

# Maandweergave voor Diensten Planning

## Overzicht
Voeg een derde weergavemodus "Maand" toe naast de bestaande "Kalender" (week) en "Lijst" weergaven. De maandweergave toont een 7-koloms, 6-rijen kalender-grid met alle diensten van de geselecteerde maand.

## Wijzigingen

### 1. PlanningToolbar.tsx -- Maand navigatie en toggle
- ViewMode type uitbreiden naar `"kalender" | "lijst" | "maand"`
- Imports: `startOfMonth`, `addMonths`, `subMonths`, `Grid3X3`
- Navigatie aanpassen: bij maand-modus navigeer per maand i.p.v. per week
- Datelabel: toon "februari 2026" i.p.v. "Week X -- dd-MM t/m dd-MM"
- Derde toggle-knop "Maand" met Grid3X3 icon toevoegen tussen Week en Lijst

### 2. useDienstenPlanning.ts -- Bredere date range
- `DienstFilters` interface uitbreiden met optioneel `viewMode` veld
- Date range berekening: bij maand-modus ophalen van 6 weken (42 dagen) data
  - gridStart = startOfWeek(startOfMonth(start))
  - gridEnd = endOfWeek(gridStart + 5 weken)
- Query keys en `.gte()/.lte()` aanpassen naar dynamische date range
- Extra imports: `startOfMonth`, `addWeeks`

### 3. Planning.tsx -- Routing en rendering
- ViewMode type uitbreiden naar `"kalender" | "lijst" | "maand"`
- `handleViewChange` type uitbreiden
- `activeFilters` uitbreiden met `viewMode`
- Conditie toevoegen: `viewMode === "maand"` rendert `PlanningMaandKalender`
- Loading skeleton: 35 cellen i.p.v. 7 bij maand-modus
- Import toevoegen: `PlanningMaandKalender`

### 4. PlanningMaandKalender.tsx -- Nieuw component
Volledig nieuw component met:

**Grid structuur:**
- Header rij: ma, di, wo, do, vr, za, zo
- 6 weken x 7 dagen = 42 dag-cellen

**Per dag-cel:**
- Dagnummer met count indicator
- Max 3 diensten zichtbaar, daarna "+X meer" tekst
- Status-kleuren (concept=grijs, open=amber, deels_bezet=oranje, volledig_bezet=groen, voltooid=blauw)
- Custom kleur als border-left override
- Spoed indicator (emoji)
- Klik opent DienstDetailSheet

**Visuele behandeling:**
- Dagen buiten huidige maand: verlaagde opacity
- Vandaag: gemarkeerd met ring/border
- Responsive: compacte weergave op kleinere schermen

**Props interface:**
- diensten, weekStart, showOpen, showIngepland, compact
- onDienstClick, onEdit, onCopy, onDelete

## Gewijzigde bestanden
1. `src/components/planning/PlanningToolbar.tsx` (bestaand)
2. `src/hooks/useDienstenPlanning.ts` (bestaand)
3. `src/pages/Planning.tsx` (bestaand)
4. `src/components/planning/PlanningMaandKalender.tsx` (nieuw)

## Technisch detail

De date range berekening in de hook is cruciaal: bij maand-modus moet de query 42 dagen ophalen (6 volle weken) zodat ook dagen van de vorige/volgende maand die in het grid vallen, diensten tonen. De `startOfWeek(startOfMonth(...))` constructie garandeert dat het grid altijd op maandag begint.

