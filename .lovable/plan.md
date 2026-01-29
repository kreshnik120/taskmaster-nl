
# Enterprise TaskListView Upgrade - Plan

## Overzicht

Upgrade de modulaire TaskListView component naar enterprise niveau met filter pills, checkbox selectie, side panel voor taakdetails, keyboard shortcuts, en bulk acties.

## Nieuwe Bestanden

| Bestand | Beschrijving | Regels |
|---------|--------------|--------|
| `TaskListFilterPills.tsx` | Toggle filter pills boven toolbar | ~100 |
| `TaskListSidePanel.tsx` | Notion-style slide-in detail panel | ~250 |
| `TaskListBulkActions.tsx` | Floating bulk actie bar onderaan | ~120 |
| `hooks/useTaskListKeyboard.ts` | Keyboard navigation hook | ~80 |
| `hooks/useTaskListSelection.ts` | Selection state management | ~50 |

## Bestaande Bestanden te Wijzigen

| Bestand | Wijzigingen |
|---------|-------------|
| `types/index.ts` | Filter types, selection state interface |
| `hooks/useTaskListFilters.ts` | Quick filter state toevoegen |
| `hooks/useTaskListData.ts` | Quick filter logica integreren |
| `TaskListTable.tsx` | Checkbox kolom, row selection highlighting, 5-kolom layout |
| `TaskListView.tsx` | Alle nieuwe componenten integreren |

## Technische Details

### 1. Filter Pills Component

```text
[Alle] [Open] [In uitvoering] [Review] [Kritiek] [Vandaag due]
```

**Gedrag:**
- Toggle buttons met accent kleur wanneer actief
- Meerdere filters kunnen tegelijk actief zijn (AND logica)
- "Alle" reset alle quick filters
- Horizontaal scrollbaar op mobiel

**Type definitie:**
```typescript
type QuickFilter = 'open' | 'in_progress' | 'review' | 'critical' | 'due_today';

interface TaskListFilters {
  searchQuery: string;
  sortBy: 'due_at' | 'priority' | 'created_at';
  sortDirection: 'asc' | 'desc';
  quickFilters: QuickFilter[]; // Nieuw
}
```

**Filter logica (in useTaskListData):**
```typescript
// Open = geen completed_at
// In uitvoering = status DOING
// Review = status REVIEW
// Kritiek = priority CRITICAL
// Vandaag due = due_at is vandaag
```

### 2. Tabel Upgrade - 5 Kolommen

| Kolom | Breedte | Inhoud |
|-------|---------|--------|
| Checkbox | 40px | Selectie checkbox + header select-all |
| Taak | 40% | Titel, beschrijving (1 regel), subtask count |
| Eigenaar | auto | Avatar (initials fallback) + naam |
| Prioriteit | 80px | Gekleurde badge |
| Deadline | 100px | Datum + overdue AlertTriangle icoon |

**Row selection:**
- Geselecteerde rijen krijgen `bg-accent/50`
- Keyboard focus krijgt `ring-2 ring-primary`
- Hover state blijft `bg-muted/50`

### 3. Side Panel (Notion-style)

**Trigger:** `onTaskSelect` callback vanuit tabel
**Positie:** Fixed right, 400px breed
**Animatie:** slide-in-right met framer-motion

**Structuur:**
```text
┌─────────────────────────────────────┐
│ [X]                          Sluiten│
├─────────────────────────────────────┤
│ Taak Titel (text-xl font-bold)      │
├─────────────────────────────────────┤
│ Status     [Dropdown ▼]             │
│ Prioriteit [Dropdown ▼]             │
│ Deadline   [Datepicker]             │
│ Eigenaar   Avatar + naam            │
├─────────────────────────────────────┤
│ Beschrijving                        │
│ Tekst...                            │
├─────────────────────────────────────┤
│ Subtaken (3/5)                      │
│ ☐ Subtaak 1                         │
│ ☑ Subtaak 2                         │
├─────────────────────────────────────┤
│ [Bewerken]  [Verwijderen]           │
└─────────────────────────────────────┘
```

**Sluiten:**
- X button rechtsboven
- Escape toets
- Klik buiten panel (overlay met opacity-0)

**Implementatie:** Geen Sheet component gebruiken (die is modal). Custom panel met fixed positioning zodat tabel zichtbaar blijft.

### 4. Keyboard Shortcuts Hook

```typescript
interface UseTaskListKeyboardOptions {
  tasks: TaskListTask[];
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onOpenPanel: (task: TaskListTask) => void;
  onClosePanel: () => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  onOpenNewTask: () => void;
  isPanelOpen: boolean;
}
```

| Toets | Actie | Guard |
|-------|-------|-------|
| `j` | selectedIndex++ (max tasks.length-1) | niet in input |
| `k` | selectedIndex-- (min 0) | niet in input |
| `Enter` | onOpenPanel(tasks[selectedIndex]) | selectedIndex >= 0 |
| `Escape` | onClosePanel() of clear selection | - |
| `/` | searchInputRef.current?.focus() | niet in input |
| `n` | onOpenNewTask() | niet in input |

### 5. Selection State Hook

```typescript
interface UseTaskListSelectionReturn {
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  toggleAll: (allIds: string[]) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  isAllSelected: (allIds: string[]) => boolean;
  isPartiallySelected: (allIds: string[]) => boolean;
}
```

### 6. Bulk Actions Bar

**Trigger:** `selectedIds.size > 0`
**Positie:** Fixed bottom center (zoals bestaande BulkActionBar)
**Animatie:** framer-motion slide up

**Inhoud:**
```text
┌─────────────────────────────────────────────────────────────┐
│ [3] geselecteerd | [Status wijzigen ▼] [Prioriteit ▼] [🗑️] [X]│
└─────────────────────────────────────────────────────────────┘
```

**Acties:**
- Status wijzigen: Dropdown met BACKLOG, READY, DOING, BLOCKED, REVIEW
- Prioriteit wijzigen: Dropdown met LOW, MEDIUM, HIGH, CRITICAL
- Verwijderen: Confirmation dialog eerst

## Component Hiërarchie

```text
TaskListView
├── TaskListFilterPills
├── TaskListToolbar (bestaand)
├── TaskListTable / TaskListCards
│   └── Checkbox per row
├── TaskListSidePanel (conditional)
└── TaskListBulkActions (conditional)
```

## State Management

```typescript
// In TaskListView.tsx
const { filters, setFilters } = useTaskListFilters(); // Extended met quickFilters
const { tasks, ... } = useTaskListData({ userId, filters, limit });
const { selectedIds, toggleSelection, ... } = useTaskListSelection();
const [panelTask, setPanelTask] = useState<TaskListTask | null>(null);
const [selectedIndex, setSelectedIndex] = useState(-1);
const searchInputRef = useRef<HTMLInputElement>(null);

useTaskListKeyboard({
  tasks,
  selectedIndex,
  onSelectedIndexChange: setSelectedIndex,
  onOpenPanel: setPanelTask,
  onClosePanel: () => setPanelTask(null),
  searchInputRef,
  onOpenNewTask: () => setDialogOpen(true),
  isPanelOpen: !!panelTask
});
```

## UI Teksten (Nederlands)

| Key | Tekst |
|-----|-------|
| filter.all | "Alle" |
| filter.open | "Open" |
| filter.in_progress | "In uitvoering" |
| filter.review | "Review" |
| filter.critical | "Kritiek" |
| filter.due_today | "Vandaag due" |
| bulk.selected | "{n} taken geselecteerd" |
| bulk.status | "Status wijzigen" |
| bulk.priority | "Prioriteit wijzigen" |
| bulk.delete | "Verwijderen" |
| panel.edit | "Bewerken" |
| panel.delete | "Verwijderen" |
| panel.close | "Sluiten" |
| panel.subtasks | "Subtaken" |
| panel.description | "Beschrijving" |

## Implementatie Volgorde

| Stap | Bestand | Actie |
|------|---------|-------|
| 1 | `types/index.ts` | QuickFilter type, selection interfaces |
| 2 | `hooks/useTaskListSelection.ts` | Selection state hook |
| 3 | `hooks/useTaskListFilters.ts` | quickFilters state toevoegen |
| 4 | `hooks/useTaskListData.ts` | Quick filter logica |
| 5 | `hooks/useTaskListKeyboard.ts` | Keyboard shortcuts |
| 6 | `TaskListFilterPills.tsx` | Filter pills UI |
| 7 | `TaskListTable.tsx` | Checkbox kolom, selection highlighting |
| 8 | `TaskListSidePanel.tsx` | Detail panel |
| 9 | `TaskListBulkActions.tsx` | Bulk actie bar |
| 10 | `TaskListView.tsx` | Alle componenten integreren |

## Accessibility

| Feature | Implementatie |
|---------|---------------|
| Keyboard navigatie | j/k/Enter/Escape/n// shortcuts |
| Focus visible | ring-2 ring-primary op geselecteerde row |
| ARIA | aria-selected op rows, aria-label op buttons |
| Screen reader | Checkbox labels, role="row" met aria-selected |
| Focus trap | Side panel krijgt focus bij open |

## Responsiviteit

| Viewport | Aanpassingen |
|----------|--------------|
| Desktop | Volledige tabel, side panel 400px |
| Mobile | Cards view (geen checkboxes), panel full-width sheet |

## Dependencies

Bestaande packages (geen nieuwe nodig):
- `framer-motion` - animaties
- `@radix-ui/react-checkbox` - checkboxes
- `date-fns` + `nl` locale - datumformattering
- `lucide-react` - iconen

## Geen Wijzigingen Aan

- Bestaande `Lijst.tsx` pagina
- `useTasksQuery.ts` hook
- Routing configuratie
- Sidebar navigatie
