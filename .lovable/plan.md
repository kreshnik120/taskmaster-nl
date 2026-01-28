
# Dashboard Agent: Uitgebreide Task Statistieken

## Situatie Analyse

De huidige codebase heeft al:
- **Dashboard pagina** op route "/" met basisstatistieken
- **RecruitmentKPIs** component voor sollicitatie/plaatsing tellingen
- **TodayFocusCard** voor focus items
- **useTasksQuery** shared hook voor taken data

De vraag is voor een nieuwe /dashboard route met gedetailleerde taakstatistieken per medewerker en per bron (notule).

---

## Voorgestelde Aanpak

**Optie A: Nieuwe pagina /dashboard naast bestaande "/"**
- Nieuwe route /dashboard met uitgebreide statistieken
- Bestaande "/" blijft "werkbord" met taken
- Sidebar krijgt twee items: "Dashboard" (/dashboard) en "Werkbord" (/)

**Optie B: Uitbreiden bestaande Dashboard**
- Voeg statistieken toe aan bestaande "/" pagina
- Gebruik tabs of sectie voor "Overzicht" vs "Taken"

Gezien de requirements kies ik **Optie A** - een nieuwe dedicated statistieken pagina.

---

## Implementatie Plan

### Fase 1: Hook `useDashboardStats`

**Bestand**: `src/hooks/useDashboardStats.ts`

Query's voor:
- Totaal taken, open, compleet, verlopen tellingen
- Breakdown per priority (CRITICAL, HIGH, MEDIUM, LOW)
- Breakdown per assignee met progress
- Breakdown per bron (source_meeting_minute_id)
- Verlopen taken lijst (due_at < now() AND completed_at IS NULL)
- Komende taken (due_at binnen 7 dagen)

```typescript
interface DashboardStats {
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  overdueTasks: number;
  byStatus: { todo: number; in_progress: number; done: number; };
  byPriority: { critical: number; high: number; medium: number; low: number; };
  byAssignee: Array<{
    userId: string;
    userName: string;
    total: number;
    completed: number;
    open: number;
    overdue: number;
  }>;
  bySource: Array<{
    sourceId: string | null;
    sourceName: string;
    total: number;
    completed: number;
    open: number;
  }>;
  overdueTasksList: Array<{
    id: string;
    title: string;
    assignee: string | null;
    dueDate: string;
    daysOverdue: number;
    sourceName: string | null;
  }>;
  upcomingTasks: Array<{
    id: string;
    title: string;
    assignee: string | null;
    dueDate: string;
    daysUntil: number;
  }>;
}
```

### Fase 2: Context Hook `useDashboardContext`

**Bestand**: `src/hooks/useDashboardContext.ts`

Wrapper hook met filter ondersteuning:

```typescript
export function useDashboardContext(filters?: {
  sourceId?: string;
  assigneeId?: string;
  includeCompleted?: boolean;
})
```

### Fase 3: Dashboard Componenten

**Map**: `src/components/dashboard-stats/`

| Component | Doel |
|-----------|------|
| `StatCards.tsx` | 4 KPI kaarten (Totaal, Open, Compleet, Verlopen) |
| `AssigneeProgress.tsx` | Per medewerker met progress bars |
| `SourceProgress.tsx` | Per bron (notule) met progress bars |
| `OverdueTasksList.tsx` | Waarschuwingslijst verlopen taken |
| `UpcomingTasksList.tsx` | Komende taken (7 dagen) |
| `DashboardHeader.tsx` | Titel + filter dropdowns |

### Fase 4: Pagina Component

**Bestand**: `src/pages/DashboardStats.tsx`

Layout met alle componenten in een grid:
- Header met filters
- 4 StatCards in een rij
- Per Medewerker sectie
- Per Bron sectie
- Verlopen waarschuwingen
- Komende taken

### Fase 5: Routing & Navigatie

**Updates**:

1. `src/App.tsx` - Nieuwe route:
```tsx
<Route path="/dashboard" element={<DashboardStats />} />
```

2. `src/components/AppSidebar.tsx` - Sidebar item aanpassen:
```typescript
// Wijzig bestaande Dashboard item naar:
{
  title: "Dashboard",
  url: "/dashboard",  // Nieuwe stats pagina
  icon: LayoutDashboard,
},
// Bestaande "/" wordt "Werkbord":
{
  title: "Werkbord",
  url: "/",
  icon: Home,
  badge: 'taskCount'
},
```

---

## Database Queries

### Hoofd Query (alle taken met relaties)

```sql
SELECT 
  t.id, t.title, t.priority, t.status,
  t.due_at, t.completed_at, t.assignee_id,
  t.source_meeting_minute_id,
  p.name as assignee_name,
  mm.task_id as minute_task_id,
  mt.title as minute_title
FROM tasks t
LEFT JOIN profiles p ON t.assignee_id = p.id
LEFT JOIN meeting_minutes mm ON t.source_meeting_minute_id = mm.id
LEFT JOIN tasks mt ON mm.task_id = mt.id
WHERE t.deleted_at IS NULL
```

### Aggregatie in JavaScript

Client-side aggregatie voor flexibiliteit:
- Group by assignee_id → per medewerker stats
- Group by source_meeting_minute_id → per bron stats
- Filter due_at < now() → verlopen
- Filter due_at in (now, now+7d) → komend

---

## UI Design

### StatCards Layout

```text
┌─────────────┬─────────────┬─────────────┬─────────────┐
│   Totaal    │    Open     │   Compleet  │   Verlopen  │
│     42      │     28      │     14      │      3      │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

### Per Medewerker Sectie

```text
┌────────────────────────────────────────────────────────┐
│ Per Medewerker                                         │
├────────────────────────────────────────────────────────┤
│ 🟢 Jan de Vries        [████████████░░] 8/10  2 verlopen│
│ 🔵 Maria Bakker        [██████████████] 6/6   0 verlopen│
│ 🟡 Pieter Jansen       [██████░░░░░░░░] 4/12  1 verlopen│
└────────────────────────────────────────────────────────┘
```

### Klikbare Navigatie

- Klik op medewerker → /lijst?assignee=userId
- Klik op bron → /notulen?id=sourceId
- Klik op verlopen taak → /kanban/taskId

---

## Technische Details

### Bestanden Aangemaakt

| Bestand | Beschrijving |
|---------|--------------|
| `src/hooks/useDashboardStats.ts` | Hoofd statistieken hook |
| `src/hooks/useDashboardContext.ts` | Context hook met filters |
| `src/pages/DashboardStats.tsx` | Nieuwe dashboard pagina |
| `src/components/dashboard-stats/StatCards.tsx` | KPI kaarten |
| `src/components/dashboard-stats/AssigneeProgress.tsx` | Per medewerker |
| `src/components/dashboard-stats/SourceProgress.tsx` | Per bron |
| `src/components/dashboard-stats/OverdueTasksList.tsx` | Verlopen taken |
| `src/components/dashboard-stats/UpcomingTasksList.tsx` | Komende taken |

### Bestanden Gewijzigd

| Bestand | Wijziging |
|---------|-----------|
| `src/App.tsx` | Route /dashboard toevoegen |
| `src/components/AppSidebar.tsx` | Sidebar item toevoegen |

---

## Samenvatting

Deze implementatie voegt een dedicated Dashboard Agent pagina toe met:
- Gedetailleerde taakstatistieken
- Per medewerker en per bron breakdowns
- Verlopen en komende taken overzichten
- Klikbare navigatie naar gefilterde views
- Exporteerbare hooks voor andere agents
