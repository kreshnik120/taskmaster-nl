
# Implementatie Plan: Mijn Taken Kanban Flow in Mijn Werk Tab

## Overzicht

Dit plan voegt een embedded Kanban-sectie toe aan de "Mijn Werk" tab van het Unified Dashboard. De sectie toont alleen de taken van de huidige gebruiker met drag-and-drop functionaliteit, max 5 taken per kolom, en volledige accessibility ondersteuning.

---

## Architectuur

```text
┌─────────────────────────────────────────────────────────────────┐
│ Mijn Werk Tab                                                    │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────┬─────────────────────────┐           │
│ │ TodayFocusCard          │ UpcomingRemindersWidget │           │
│ └─────────────────────────┴─────────────────────────┘           │
│                                                                  │
│ ─────────────────── border-t mt-6 pt-6 ─────────────────────    │
│                                                                  │
│ 📊 Mijn Taken (badge: n taken)        [Open volledig Kanban →]  │
│ ┌──────────┬──────────┬──────────┬──────────┬──────────┐       │
│ │ Start.   │ Actie    │ Afwacht  │ In afw.  │ Laatste  │       │
│ │ (BACKLOG)│ (READY)  │ (DOING)  │ (BLOCKED)│ (REVIEW) │       │
│ │          │          │          │          │          │       │
│ │ TaskCard │ TaskCard │ TaskCard │          │          │       │
│ │ TaskCard │          │          │          │          │       │
│ │ [+2 meer]│          │          │          │          │       │
│ └──────────┴──────────┴──────────┴──────────┴──────────┘       │
│ ← horizontale scroll op mobile →                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementatie Stappen

### Stap 1: Nieuw Component - MyTasksFlowSection.tsx

**Bestand:** `src/components/dashboard/MyTasksFlowSection.tsx`

**Kernfunctionaliteit:**
- Haalt alleen taken op waar `assignee_id` = huidige gebruiker
- Filtert op `completed_at IS NULL` en `deleted_at IS NULL`
- Toont max 5 kolommen: BACKLOG, READY, DOING, BLOCKED, REVIEW (geen DONE)
- Max 5 taken per kolom zichtbaar, daarna "Bekijk meer (n)" link

**Data Query:**
```typescript
// Kolommen laden (status in COLUMNS_TO_SHOW)
const { data: columns } = await supabase
  .from("columns")
  .select("id, name, status, order")
  .in("status", ["BACKLOG", "READY", "DOING", "BLOCKED", "REVIEW"])
  .order("order");

// Taken van huidige gebruiker laden
const { data: tasks } = await supabase
  .from("tasks")
  .select(`
    id, title, description, priority, assignee_id,
    due_at, completed_at, column_id, order_key,
    profiles:profiles!tasks_assignee_id_fkey(name, email)
  `)
  .eq("assignee_id", user.id)
  .is("deleted_at", null)
  .is("completed_at", null)
  .order("due_at", { ascending: true });
```

**Drag & Drop:**
- Hergebruik `@dnd-kit/core` en `@dnd-kit/sortable` (al geinstalleerd)
- `PointerSensor` met distance threshold van 10px
- Optimistische UI update bij verplaatsen
- Toast feedback bij succesvolle verplaatsing

**Accessibility (WCAG 2.1 AA):**
- `aria-live="polite"` voor status updates
- `role="region"` met `aria-label` op kolommen
- Keyboard alternatief via DropdownMenu per taak
- Focus visible op alle interactieve elementen
- Touch targets minimum 44px op mobile (w-72)

### Stap 2: Wijziging UnifiedDashboard.tsx

**Bestand:** `src/pages/UnifiedDashboard.tsx`

**Wijzigingen:**
1. Import toevoegen:
   ```typescript
   import { MyTasksFlowSection } from "@/components/dashboard/MyTasksFlowSection";
   ```

2. TabsContent "mijn-werk" uitbreiden met de nieuwe sectie:
   ```tsx
   <TabsContent value="mijn-werk" className="space-y-6 mt-6">
     {/* Bestaande focus sectie - ONGEWIJZIGD */}
     <div className="grid gap-6 md:grid-cols-2">
       <TodayFocusCard />
       <UpcomingRemindersWidget />
     </div>
     
     {/* NIEUW: Mijn Taken Flow sectie */}
     <MyTasksFlowSection />
   </TabsContent>
   ```

---

## Component Structuur

### MyTasksFlowSection Props & State

```typescript
// Geen props nodig - component haalt eigen data op

// State
const [tasks, setTasks] = useState<Task[]>([]);
const [columns, setColumns] = useState<Column[]>([]);
const [loading, setLoading] = useState(true);
const [user, setUser] = useState<User | null>(null);
const [activeTask, setActiveTask] = useState<Task | null>(null);      // Voor DragOverlay
const [selectedTask, setSelectedTask] = useState<Task | null>(null);  // Voor TaskDetailModal
const [detailModalOpen, setDetailModalOpen] = useState(false);
const [statusMessage, setStatusMessage] = useState("");               // Accessibility
```

### UI States

| State | Weergave |
|-------|----------|
| Loading | Centered Loader2 spinner |
| Geen taken | Empty state met CheckCircle2 icon + link naar /kanban |
| Lege kolom | Subtiel "Geen taken" met Inbox icon |
| Overflow | "Bekijk meer (n)" button die linkt naar /kanban |

---

## Responsive Design

| Breakpoint | Kolom Breedte | Gedrag |
|------------|---------------|--------|
| Mobile (<768px) | `w-72` (288px) | Horizontale scroll met `snap-x snap-mandatory` |
| Desktop (≥768px) | `w-64` (256px) | Alle kolommen in flex row, overflow-x-auto |

---

## Hergebruik Bestaande Componenten

| Component | Bestand | Gebruik |
|-----------|---------|---------|
| TaskCard | `src/components/TaskCard.tsx` | Taakkaarten in kolommen (zonder subtasks prop) |
| TaskDetailModal | `src/components/TaskDetailModal.tsx` | Detail modal bij klik op taak |
| Card, Badge, Button | `@/components/ui/*` | Kolom headers en styling |
| DropdownMenu | `@/components/ui/dropdown-menu` | Keyboard-toegankelijk verplaatsmenu |

---

## Bestaande Kolommen (Database)

| ID | Naam | Status | Order |
|----|------|--------|-------|
| ...440001 | Start. | BACKLOG | 1 |
| ...440002 | Actie uitgezet | READY | 2 |
| ...440003 | Afwachten op antwoord | DOING | 3 |
| ...440004 | In afwachting | BLOCKED | 4 |
| ...440005 | Laatste actie uitvoeren | REVIEW | 5 |
| ...440006 | Afgeronde taken | DONE | 6 (niet getoond) |

---

## Belangrijke Implementatie Details

### 1. Kolom Toewijzing
- Taken zonder `column_id` worden getoond in BACKLOG kolom
- `getTasksForColumn` helper functie handelt dit af

### 2. Overflow Handling
```typescript
const getVisibleTasks = (columnId: string) => {
  const allTasks = getTasksForColumn(columnId);
  return {
    visible: allTasks.slice(0, MAX_VISIBLE_TASKS), // Max 5
    overflow: Math.max(0, allTasks.length - MAX_VISIBLE_TASKS),
    total: allTasks.length
  };
};
```

### 3. Keyboard Accessibility
Elk taakkaart krijgt een DropdownMenu met "Verplaats naar" submenu:
```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" className="h-6 w-6">
      <MoreHorizontal className="h-3 w-3" />
      <span className="sr-only">Acties voor {task.title}</span>
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuLabel>Verplaats naar</DropdownMenuLabel>
    {columns.filter(c => c.id !== task.column_id).map(c => (
      <DropdownMenuItem onClick={() => moveTaskToColumn(task.id, c.id)}>
        {c.name}
      </DropdownMenuItem>
    ))}
  </DropdownMenuContent>
</DropdownMenu>
```

---

## Wijzigingen Overzicht

| Bestand | Actie | Beschrijving |
|---------|-------|--------------|
| `src/components/dashboard/MyTasksFlowSection.tsx` | NIEUW | Embedded Kanban component |
| `src/pages/UnifiedDashboard.tsx` | WIJZIG | Import + toevoegen aan mijn-werk tab |

---

## Niet Wijzigen

- Sidebar items
- TodayFocusCard.tsx
- UpcomingRemindersWidget.tsx
- KanbanColumn.tsx (hergebruik zonder wijziging)
- TaskCard.tsx (hergebruik zonder wijziging)
- TaskDetailModal.tsx (hergebruik zonder wijziging)
- Geen nieuwe npm packages

---

## Acceptatie Criteria

**Functioneel:**
- Focus sectie blijft bovenaan
- Mijn Taken sectie verschijnt onder focus met visuele scheiding
- Alleen taken van huidige gebruiker worden getoond
- Max 5 taken per kolom, daarna "Bekijk meer" link
- Drag & drop werkt tussen kolommen
- Keyboard dropdown als alternatief voor drag
- Klik op taak opent TaskDetailModal
- "Open volledig Kanban" linkt naar /kanban
- Empty states correct weergegeven

**Technisch:**
- Geen TypeScript errors
- Geen console errors
- ARIA labels aanwezig
- Responsive op alle breakpoints
