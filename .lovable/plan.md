
# Design Consistentie: Glass Polish op Enterprise Niveau

## Overzicht

5 styling-inconsistenties worden opgelost zonder enige functionaliteit te wijzigen. Alleen CSS classes worden toegevoegd/aangepast op bestaande elementen.

---

## Wijzigingen

### 1. CSS: `glass-drag-overlay-indigo` aanmaken in `src/index.css`

Er bestaat geen `glass-drag-overlay-indigo` class. Aanmaken met hetzelfde patroon als de teal/rose varianten, maar met indigo HSL waarden (hue 234, sat 45%):

- Light: shadow met `hsla(234, 45%, 52%, ...)` 
- Dark: shadow met `hsla(234, 45%, 20%, ...)`
- Toevoegen aan de `.dnd-dragging` guard selector

Optioneel: `glass-filter-bar-indigo` aanmaken als die nog niet bestaat (zelfde patroon als andere filter-bar varianten).

### 2. `src/components/dashboard/EmbeddedListView.tsx` - Glass styling toevoegen

Alleen class-toevoegingen, geen logica-wijzigingen:

- **Filter/sort bar** (regels ~720-791): wrap in container met `glass-filter-bar-slate` class
- **Search input** (regel ~698): `glass-search-input` class toevoegen
- **Table wrapper** (regel ~1032): `glass-liquid-card glass-liquid-card-slate` toevoegen aan de `div.rounded-lg.border`
- **TableRow hover** (regel ~1079): `table-row-hover-slate` toevoegen naast bestaande hover
- **KPI cards**: behouden zoals ze zijn (gebruiken al `KPICard` component)

### 3. `src/components/dashboard/EmbeddedListCards.tsx` - Mobile glass styling

- `MobileTableCard` wrapper: `glass-card-slate` class toevoegen aan elke card via de bestaande `className` of wrapper

### 4. `src/components/TaskDetailModal.tsx` - Context-aware kleuren

**Interface uitbreiden:**
```
interface TaskDetailModalProps {
  // bestaande props...
  contextColor?: "indigo" | "teal" | "slate" | "amber" | "violet" | "rose" | "emerald";
}
```

Default: `"indigo"` (backwards compatible).

**Collapsible triggers aanpassen** (6 stuks, regels ~1201, 1312, 1358, 1422, 1506):
- Van: `collapsible-glass-indigo` (hardcoded)
- Naar: `collapsible-glass-${contextColor}` (dynamisch via template literal)

### 5. `src/pages/UnifiedDashboard.tsx` - contextColor doorgeven

Overal waar `TaskDetailModal` wordt geopend: de `contextColor` prop meegeven op basis van `TAB_CONTEXT_MAP[activeTab]`. De bestaande `TAB_CONTEXT_MAP` bevat al de juiste mapping.

### 6. `src/components/dashboard/EmbeddedCalendarView.tsx` - Teal context op dag cards

- **Dag Card** (regel ~772-778): `glass-card-teal` class toevoegen aan de Card wrapper
- **Plus knop** (regel ~796-800): `text-tab-kalender-500` hover kleur toevoegen
- Assignee kleuren op task items zelf blijven ONGEWIJZIGD

### 7. `src/components/dashboard/MyTasksFlowSection.tsx` - Filter bar glass upgrade

- **Sort/search controls container** (regels ~594-659): `glass-filter-bar-indigo` class toevoegen aan de wrapper div
- **Search input** (regel ~656): behoudt bestaande `glass-search-input`
- Drag overlay in het Kanban bord: `glass-drag-overlay-indigo` gebruiken (i.p.v. `glass-drag-overlay-enhanced`)

### 8. `src/components/dashboard/MyWeekCalendarSection.tsx` - Drag overlay

- DragOverlay: `glass-drag-overlay-indigo` gebruiken voor consistentie met het indigo thema van "Mijn Werk"

---

## Technisch Overzicht

| Onderdeel | Bestand | Wijziging |
|-----------|---------|-----------|
| CSS classes | `index.css` | `glass-drag-overlay-indigo` + `glass-filter-bar-indigo` toevoegen |
| Lijst tab glass | `EmbeddedListView.tsx` | Class toevoegingen op filter bar, table, rows |
| Lijst mobile glass | `EmbeddedListCards.tsx` | `glass-card-slate` op cards |
| Modal context | `TaskDetailModal.tsx` | `contextColor` prop + dynamische collapsible classes |
| Dashboard doorgifte | `UnifiedDashboard.tsx` | `contextColor` prop op TaskDetailModal |
| Kalender teal | `EmbeddedCalendarView.tsx` | `glass-card-teal` op dag cards |
| Kanban filter bar | `MyTasksFlowSection.tsx` | `glass-filter-bar-indigo` op controls |
| Weekkalender overlay | `MyWeekCalendarSection.tsx` | `glass-drag-overlay-indigo` |

## Wat NIET verandert

- Geen functionaliteit, logica of data-flows
- Geen database wijzigingen
- Geen nieuwe componenten
- Geen import/routing wijzigingen
- Assignee kleuren op kalender task items blijven behouden
