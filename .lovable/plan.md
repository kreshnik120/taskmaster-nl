
# Modulaire TaskListView Component

## Overzicht

We bouwen een herbruikbare TaskListView component die op meerdere plekken in de applicatie kan worden gebruikt. De component maakt optimaal gebruik van de bestaande `useTasksQuery` hook en biedt een responsieve weergave (tabel op desktop, cards op mobiel).

## Folder Structuur

```text
src/components/TaskListView/
├── index.ts                    # Barrel export
├── TaskListView.tsx            # Hoofd component
├── TaskListTable.tsx           # Desktop tabel weergave
├── TaskListCards.tsx           # Mobiele card weergave
├── TaskListToolbar.tsx         # Filter/zoek toolbar
├── TaskListEmptyState.tsx      # Lege staat component
├── types/
│   └── index.ts                # Task type definities
└── hooks/
    ├── useTaskListData.ts      # Data hook (wraps useTasksQuery)
    └── useTaskListFilters.ts   # Filter/sorteer state hook
```

## Props Interface

| Prop | Type | Default | Beschrijving |
|------|------|---------|--------------|
| `userId` | `string \| undefined` | - | Filter op specifieke gebruiker |
| `showToolbar` | `boolean` | `true` | Toon/verberg toolbar |
| `limit` | `number \| undefined` | - | Max aantal taken (voor dashboard preview) |
| `onTaskSelect` | `(task: Task) => void` | - | Callback bij taak selectie |
| `className` | `string` | - | Extra CSS classes |

## Types (types/index.ts)

```typescript
export interface TaskListTask {
  id: string;
  title: string;
  description: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  start_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  next_action: string | null;
  assignee_id: string | null;
  org_id: string;
  created_at: string;
  profiles: {
    name: string | null;
    email: string | null;
  } | null;
  organizations: { name: string } | null;
  subtask_count?: number;
  completed_subtask_count?: number;
}

export interface TaskListFilters {
  searchQuery: string;
  sortBy: 'due_at' | 'priority' | 'created_at';
  sortDirection: 'asc' | 'desc';
}

export interface TaskListViewProps {
  userId?: string;
  showToolbar?: boolean;
  limit?: number;
  onTaskSelect?: (task: TaskListTask) => void;
  className?: string;
}
```

## Hooks

### useTaskListData.ts

Hergebruikt de bestaande `useTasksQuery` hook en voegt client-side filtering toe:

```typescript
export function useTaskListData(options: {
  userId?: string;
  filters: TaskListFilters;
  limit?: number;
}) {
  const query = useTasksQuery(); // Hergebruik shared cache
  
  const filteredData = useMemo(() => {
    let tasks = query.data || [];
    
    // Filter op userId indien aanwezig
    if (options.userId) {
      tasks = tasks.filter(t => t.assignee_id === options.userId);
    }
    
    // Zoek filter
    if (options.filters.searchQuery) {
      const q = options.filters.searchQuery.toLowerCase();
      tasks = tasks.filter(t => 
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
      );
    }
    
    // Sorteer
    tasks = sortTasks(tasks, options.filters);
    
    // Limit
    if (options.limit) {
      tasks = tasks.slice(0, options.limit);
    }
    
    return tasks;
  }, [query.data, options]);
  
  return {
    tasks: filteredData,
    totalCount: query.data?.length || 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  };
}
```

### useTaskListFilters.ts

Beheert filter/sorteer state met localStorage persistentie:

```typescript
export function useTaskListFilters() {
  const [filters, setFilters] = useState<TaskListFilters>(() => ({
    searchQuery: "",
    sortBy: localStorage.getItem('tasklist-sort-by') as any || 'due_at',
    sortDirection: localStorage.getItem('tasklist-sort-dir') as any || 'asc'
  }));
  
  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('tasklist-sort-by', filters.sortBy);
    localStorage.setItem('tasklist-sort-dir', filters.sortDirection);
  }, [filters.sortBy, filters.sortDirection]);
  
  return { filters, setFilters };
}
```

## Component Architectuur

### TaskListView.tsx (Hoofd Component)

```typescript
export function TaskListView({
  userId,
  showToolbar = true,
  limit,
  onTaskSelect,
  className
}: TaskListViewProps) {
  const isMobile = useIsMobile();
  const { filters, setFilters } = useTaskListFilters();
  const { tasks, totalCount, isLoading, error } = useTaskListData({
    userId,
    filters,
    limit
  });
  
  // Loading state
  if (isLoading) {
    return <LoadingSkeleton />;
  }
  
  // Error state
  if (error) {
    return <ErrorState message="Fout bij laden van taken" />;
  }
  
  // Empty state
  if (tasks.length === 0) {
    return <TaskListEmptyState filtered={!!filters.searchQuery} />;
  }
  
  return (
    <div className={className}>
      {showToolbar && (
        <TaskListToolbar 
          filters={filters} 
          onChange={setFilters}
          taskCount={tasks.length}
          totalCount={totalCount}
        />
      )}
      
      {isMobile ? (
        <TaskListCards tasks={tasks} onTaskSelect={onTaskSelect} />
      ) : (
        <TaskListTable tasks={tasks} onTaskSelect={onTaskSelect} />
      )}
    </div>
  );
}
```

### Responsieve Weergave

| Viewport | Component | Weergave |
|----------|-----------|----------|
| Desktop (≥768px) | `TaskListTable` | Tabel met kolommen: Taak, Eigenaar, Prioriteit, Deadline |
| Mobile (<768px) | `TaskListCards` | Cards gestapeld, compact design |

## UI Teksten (Nederlands)

| Context | Tekst |
|---------|-------|
| Laden | "Taken laden..." |
| Fout | "Fout bij laden van taken" |
| Leeg (geen filter) | "Geen taken gevonden" |
| Leeg (met filter) | "Geen taken gevonden voor deze zoekopdracht" |
| Gefilterd | "{X} van {Y} taken" |
| Zoek placeholder | "Zoek taken..." |
| Sorteer: Deadline | "Deadline" |
| Sorteer: Prioriteit | "Prioriteit" |
| Sorteer: Aangemaakt | "Aangemaakt" |

## Bestanden Overzicht

| Bestand | Regels | Beschrijving |
|---------|--------|--------------|
| `index.ts` | ~5 | Barrel export |
| `types/index.ts` | ~35 | Type definities |
| `hooks/useTaskListFilters.ts` | ~40 | Filter state hook |
| `hooks/useTaskListData.ts` | ~70 | Data hook met filtering |
| `TaskListView.tsx` | ~80 | Hoofd component |
| `TaskListToolbar.tsx` | ~60 | Zoek en sorteer toolbar |
| `TaskListTable.tsx` | ~100 | Desktop tabel weergave |
| `TaskListCards.tsx` | ~80 | Mobiele cards weergave |
| `TaskListEmptyState.tsx` | ~30 | Lege staat UI |

## Technische Overwegingen

### Cache Hergebruik
- Gebruikt dezelfde `['active-tasks']` cache als Dashboard en Opvolging
- Geen extra database calls
- Realtime updates automatisch gesynchroniseerd

### Performance
- `useMemo` voor client-side filtering
- Geen onnodige re-renders bij filter wijzigingen
- Tabel virtualisatie kan later worden toegevoegd

### Accessibility
- Keyboard navigatie voor toolbar
- ARIA labels op interactieve elementen
- Focus management bij taak selectie

## Geen Wijzigingen Aan

- `src/pages/Lijst.tsx` (bestaande implementatie)
- `src/hooks/useTasksQuery.ts` (shared hook)
- Andere bestaande componenten

## Implementatie Volgorde

| Stap | Bestand | Actie |
|------|---------|-------|
| 1 | `types/index.ts` | Type definities |
| 2 | `hooks/useTaskListFilters.ts` | Filter hook |
| 3 | `hooks/useTaskListData.ts` | Data hook |
| 4 | `TaskListEmptyState.tsx` | Lege staat |
| 5 | `TaskListToolbar.tsx` | Toolbar |
| 6 | `TaskListTable.tsx` | Desktop tabel |
| 7 | `TaskListCards.tsx` | Mobiele cards |
| 8 | `TaskListView.tsx` | Hoofd component |
| 9 | `index.ts` | Barrel export |
