
# Quality & Performance Upgrade voor TaskListView

## Overzicht

Deze upgrade voegt enterprise-grade kwaliteit en performance verbeteringen toe aan de TaskListView component:
1. Virtualisatie voor grote lijsten met react-virtuoso
2. Error boundaries voor crash preventie
3. WCAG 2.1 AA accessibility verbeteringen
4. Verbeterde loading skeletons

## Implementatie Details

### 1. Virtualisatie met react-virtuoso

We gebruiken `react-virtuoso` (reeds geinstalleerd) om alleen zichtbare rijen te renderen bij >50 taken.

**Nieuwe component: `TaskListVirtualized.tsx`**

| Eigenschap | Waarde |
|------------|--------|
| Threshold | 50 taken |
| Row height (desktop) | 64px |
| Row height (mobile) | 120px |
| Overscan | 5 rijen |
| Smooth scroll | Ja |

**Logica in TaskListTable.tsx:**
```typescript
const VIRTUALIZATION_THRESHOLD = 50;

if (tasks.length > VIRTUALIZATION_THRESHOLD) {
  return <TaskListVirtualized ... />;
} else {
  return <RegularTable ... />;
}
```

De virtualized variant gebruikt `TableVirtuoso` component van react-virtuoso die naadloos integreert met de bestaande tabel styling.

### 2. Error Boundary Component

**Nieuw bestand: `TaskListErrorBoundary.tsx`**

Een class component die React errors opvangt en een nette foutmelding toont:

```text
+---------------------------------------+
|          [AlertTriangle]              |
|                                       |
|       Er ging iets mis                |
|                                       |
|  Er is een fout opgetreden bij het    |
|  laden van de taken                   |
|                                       |
|         [Vernieuwen]                  |
+---------------------------------------+
```

**Integratie:** Wrap de gehele TaskListView content in de error boundary binnen TaskListView.tsx.

### 3. WCAG 2.1 AA Accessibility Verbeteringen

| Component | ARIA Toevoegingen |
|-----------|-------------------|
| **TaskListTable** | `role="grid"`, `aria-rowcount`, `aria-colcount` op Table |
| **Tabel rijen** | `role="row"`, `aria-rowindex`, `aria-selected` |
| **Tabel cellen** | `role="gridcell"` |
| **TaskListFilterPills** | `role="group"`, `aria-label="Filters"` |
| **TaskListSidePanel** | `role="complementary"`, `aria-label="Taak details"` |
| **TaskListBulkActions** | `role="toolbar"`, `aria-label="Bulk acties"` |
| **TaskListCards** | `role="list"`, cards krijgen `role="listitem"` |

**Skip Link:** Voeg een verborgen skip link toe bovenaan die direct naar de takenlijst springt.

**Focus Management:**
- Alle interactieve elementen hebben zichtbare focus ring (reeds aanwezig via Tailwind)
- Focus trap in side panel (reeds geimplementeerd)

**Screen Reader Announcements:**
- Live region voor filter resultaten: "{n} taken gevonden"
- Voeg `aria-live="polite"` toe voor dynamische updates

**Nieuwe utility: `utils/accessibility.ts`**

```typescript
// Helper functies voor accessibility
export function announceToScreenReader(message: string): void;
export function generateAriaLabel(task: TaskListTask): string;
export function focusFirstInteractive(container: HTMLElement): void;
```

### 4. Verbeterde Loading Skeleton

**Wijzigingen in TaskListView.tsx:**

Huidige skeleton:
```text
[=====================================] <- search bar
[=====================================] <- row
[=====================================] <- row
...
```

Verbeterde skeleton met correcte 5-kolom layout:
```text
[==] [========] [====] [===] [====]   <- Header simulatie
[==] [========] [====] [===] [====]   <- Row 1 (met checkbox)
[==] [========] [====] [===] [====]   <- Row 2
[==] [========] [====] [===] [====]   <- Row 3
[==] [========] [====] [===] [====]   <- Row 4
[==] [========] [====] [===] [====]   <- Row 5
```

**Accessibility toevoegingen:**
- `aria-busy="true"` op container
- `aria-label="Taken worden geladen"` op skeleton
- Pulse animatie behouden (reeds aanwezig via `animate-pulse`)

## Nieuwe Bestanden

| Bestand | Beschrijving | Regels |
|---------|--------------|--------|
| `TaskListErrorBoundary.tsx` | Error boundary class component | ~60 |
| `TaskListVirtualized.tsx` | Virtualized tabel met react-virtuoso | ~150 |
| `utils/accessibility.ts` | A11y helper functies | ~40 |

## Te Wijzigen Bestanden

| Bestand | Wijzigingen |
|---------|-------------|
| `TaskListView.tsx` | Error boundary wrapper, verbeterde skeleton, skip link, aria-live region |
| `TaskListTable.tsx` | ARIA grid attributes, conditionele virtualisatie |
| `TaskListCards.tsx` | `role="list"`, `role="listitem"`, ARIA labels |
| `TaskListFilterPills.tsx` | `role="group"`, `aria-label="Filters"` |
| `TaskListSidePanel.tsx` | `role="complementary"`, `aria-label="Taak details"` |
| `TaskListBulkActions.tsx` | `role="toolbar"`, `aria-label="Bulk acties"` |
| `index.ts` | Export TaskListErrorBoundary |

## Implementatie Volgorde

| Stap | Bestand | Actie |
|------|---------|-------|
| 1 | `utils/accessibility.ts` | A11y helper functies |
| 2 | `TaskListErrorBoundary.tsx` | Error boundary component |
| 3 | `TaskListVirtualized.tsx` | Virtualized tabel variant |
| 4 | `TaskListTable.tsx` | ARIA attributes + virtualisatie conditie |
| 5 | `TaskListCards.tsx` | ARIA list attributes |
| 6 | `TaskListFilterPills.tsx` | ARIA group |
| 7 | `TaskListSidePanel.tsx` | ARIA complementary |
| 8 | `TaskListBulkActions.tsx` | ARIA toolbar |
| 9 | `TaskListView.tsx` | Error boundary, skeleton, skip link, live region |
| 10 | `index.ts` | Update exports |

## UI Teksten (Nederlands)

| Context | Tekst |
|---------|-------|
| Error title | "Er ging iets mis" |
| Error description | "Er is een fout opgetreden bij het laden van de taken" |
| Error button | "Vernieuwen" |
| Loading | "Taken worden geladen..." |
| Skip link | "Spring naar takenlijst" |
| Filter announcement | "{n} taken gevonden" |
| Filter group | "Filters" |
| Task details panel | "Taak details" |
| Bulk actions | "Bulk acties" |

## Performance Impact

| Scenario | Voor | Na |
|----------|------|-----|
| 50 taken | 50 DOM nodes | 50 DOM nodes |
| 100 taken | 100 DOM nodes | ~20 DOM nodes |
| 500 taken | 500 DOM nodes | ~20 DOM nodes |
| 1000 taken | 1000 DOM nodes | ~20 DOM nodes |

Met virtualisatie worden alleen de zichtbare rijen (~15-20) plus overscan (5) gerenderd, ongeacht het totale aantal taken.

## Behouden Functionaliteit

| Feature | Status |
|---------|--------|
| Keyboard shortcuts (j/k/Enter/Escape/n//) | Behouden |
| Responsive design (tabel/cards) | Behouden |
| Filter pills | Behouden |
| Side panel | Behouden |
| Bulk actions | Behouden |
| Selection state | Behouden |

## Geen Wijzigingen Aan

- `useTasksQuery.ts` hook
- Routing configuratie
- `Lijst.tsx` pagina
- Sidebar navigatie
