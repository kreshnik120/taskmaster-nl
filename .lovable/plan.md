

# Onderdeel 6: Realtime Standaardisatie & Fixes

## Samenvatting Audit

Na grondige analyse zijn er **4 kritieke categorieën** van realtime problemen geïdentificeerd:

---

## Categorie 1: Redundante Subscriptions (INEFFICIËNTIE)

### Probleem
Meerdere componenten openen **separate channels** voor dezelfde `tasks` tabel in plaats van de shared `useTasksQuery` hook te gebruiken:

| Component | Channel Name | Tabel | Status |
|-----------|--------------|-------|--------|
| `useTasksQuery.ts` | `shared-tasks-realtime` | tasks | ✅ Goed (met debounce) |
| `EmbeddedListView.tsx` | `embedded-lijst-tasks-changes` | tasks | ❌ Redundant |
| `EmbeddedCalendarView.tsx` | `embedded-kalender-tasks-changes` | tasks | ❌ Redundant |
| `AppSidebar.tsx` | `sidebar-tasks-count` | tasks | ❌ Redundant |

**Impact**: 4 actieve WebSocket channels in plaats van 1. Dit verspilt bandbreedte en kan Supabase connection limits bereiken.

### Oplossing
- `EmbeddedListView` en `EmbeddedCalendarView` moeten migreren naar `useTasksQuery` hook
- `AppSidebar` kan de shared cache invalidation volgen via `ACTIVE_TASKS_QUERY_KEY`

---

## Categorie 2: Ontbrekende Realtime (KRITIEK)

### Probleem
Twee kritieke views missen volledig realtime subscriptions:

| Component | Huidige Status | Impact |
|-----------|----------------|--------|
| `MyTasksFlowSection.tsx` | **Geen realtime** | Kanban ziet geen updates van andere views |
| `Kanban.tsx` | Alleen subtasks | Mist task changes van andere gebruikers |

### Oplossing
- `MyTasksFlowSection` moet migreren naar `useTasksQuery` of eigen subscription toevoegen
- `Kanban.tsx` moet task subscription toevoegen

---

## Categorie 3: Ontbrekende CHANNEL_ERROR Handling (HOOG)

### Probleem
8 van 11 subscriptions missen error handling. Als de verbinding faalt, blijft de UI "dood" zonder feedback:

| Component | CHANNEL_ERROR | Reconnect |
|-----------|---------------|-----------|
| `useTasksQuery.ts` | ✅ Ja | ❌ Nee |
| `EmbeddedListView.tsx` | ❌ Nee | ❌ Nee |
| `EmbeddedCalendarView.tsx` | ❌ Nee | ❌ Nee |
| `AppSidebar.tsx` | ❌ Nee | ❌ Nee |
| `useMySubtasks.ts` | ❌ Nee | ❌ Nee |
| `Kanban.tsx` | ❌ Nee | ❌ Nee |
| `ChatWidget.tsx` | ❌ Nee | ❌ Nee |
| `useWhatsAppMessages.ts` | ❌ Nee | ❌ Nee |

### Oplossing
Creëer een `useRealtimeChannel` utility hook met:
- Automatische CHANNEL_ERROR logging
- Optionele reconnect logic
- Consistent cleanup

---

## Categorie 4: Ontbrekende Debouncing (PERFORMANCE)

### Probleem
Alleen `useTasksQuery.ts` heeft 200ms debounce. Alle andere subscriptions triggeren **immediate refetch** op elk event:

```typescript
// EmbeddedListView.tsx (line 146) - GEEN DEBOUNCE
.on('postgres_changes', {...}, () => fetchTasks())
```

**Impact**: Bij bulk updates (bijv. 50 taken importeren) worden 50 network requests tegelijk getriggerd.

### Oplossing
Alle realtime callbacks moeten debouncing toepassen (200ms standaard).

---

## Implementatie Plan

### Stap 1: Creëer Utility Hook `useRealtimeChannel.ts` (NIEUW)

**Bestand**: `src/hooks/useRealtimeChannel.ts`

```typescript
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

interface RealtimeConfig {
  channelName: string;
  table: string;
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  filter?: string;
  onEvent: () => void;
  debounceMs?: number;
}

/**
 * Standardized realtime subscription hook
 * Features:
 * - Automatic CHANNEL_ERROR handling with logging
 * - Configurable debounce (default 200ms)
 * - Proper cleanup on unmount
 */
export function useRealtimeChannel({
  channelName,
  table,
  event = '*',
  filter,
  onEvent,
  debounceMs = 200
}: RealtimeConfig) {
  const log = logger.create(channelName);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event, schema: 'public', table, filter },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(onEvent, debounceMs);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          log.log('Channel subscribed');
        }
        if (status === 'CHANNEL_ERROR') {
          log.error('Channel error - realtime may be unavailable');
        }
        if (status === 'TIMED_OUT') {
          log.warn('Channel timed out');
        }
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [channelName, table, event, filter, onEvent, debounceMs]);
}
```

---

### Stap 2: Update `EmbeddedListView.tsx`

**Wijzigingen**:
1. Verwijder eigen subscription (lines 136-152)
2. Migreer naar `useTasksQuery` hook OF gebruik nieuwe `useRealtimeChannel`
3. Filter data client-side uit shared cache

**Optie A: Gebruik useTasksQuery (aanbevolen)**
```typescript
// VAN: eigen fetchTasks() en subscription
// NAAR:
import { useTasksQuery } from '@/hooks/useTasksQuery';

// In component:
const { data: allTasks, isLoading } = useTasksQuery();

// Filter client-side voor deze view
const tasks = useMemo(() => {
  if (!allTasks) return [];
  return allTasks.filter(t => /* filters */);
}, [allTasks, filters]);
```

**Optie B: Gebruik useRealtimeChannel (indien eigen fetch nodig)**
```typescript
// Vervang lines 136-152 met:
useRealtimeChannel({
  channelName: 'embedded-lijst-tasks',
  table: 'tasks',
  onEvent: fetchTasks,
  debounceMs: 200
});
```

---

### Stap 3: Update `EmbeddedCalendarView.tsx`

**Wijzigingen** (lines 271-286):
```typescript
// VAN:
const tasksChannel = supabase
  .channel('embedded-kalender-tasks-changes')
  .on('postgres_changes', {...}, () => fetchTasks())
  .subscribe();

// NAAR:
useRealtimeChannel({
  channelName: 'embedded-kalender-tasks',
  table: 'tasks',
  onEvent: fetchTasks,
  debounceMs: 200
});

useRealtimeChannel({
  channelName: 'embedded-kalender-reminders',
  table: 'reminders',
  onEvent: fetchReminders,
  debounceMs: 200
});
```

---

### Stap 4: Update `MyTasksFlowSection.tsx` (KRITIEK)

**Probleem**: Geen realtime - Kanban ziet geen updates

**Toevoegen na line 196**:
```typescript
// Realtime subscription voor task updates
useRealtimeChannel({
  channelName: 'mytasks-flow-realtime',
  table: 'tasks',
  filter: user ? `assignee_id=eq.${user.id}` : undefined,
  onEvent: loadData,
  debounceMs: 200
});
```

---

### Stap 5: Update `AppSidebar.tsx`

**Wijzigingen** (lines 283-297):
```typescript
// VAN: eigen channel zonder error handling
// NAAR:
useRealtimeChannel({
  channelName: 'sidebar-tasks-count',
  table: 'tasks',
  onEvent: () => queryClient.invalidateQueries({ queryKey: ['active-task-count'] }),
  debounceMs: 200
});
```

---

### Stap 6: Update `useMySubtasks.ts`

**Wijzigingen** (lines 71-94):
```typescript
// VAN: eigen subscription zonder error handling
// NAAR:
useRealtimeChannel({
  channelName: 'my-subtasks-updates',
  table: 'subtasks',
  onEvent: loadSubtasks,
  debounceMs: 200
});
```

---

### Stap 7: Update `Kanban.tsx` - Voeg Tasks Subscription Toe

**Wijzigingen** (na line 196):
```typescript
// TOEVOEGEN: Tasks subscription (naast bestaande subtasks)
useRealtimeChannel({
  channelName: 'kanban-tasks-realtime',
  table: 'tasks',
  onEvent: loadData,
  debounceMs: 200
});
```

---

## Implementatie Volgorde

| Stap | Bestand | Actie | Impact |
|------|---------|-------|--------|
| 1 | `useRealtimeChannel.ts` | Nieuw bestand | Utility foundation |
| 2 | `EmbeddedListView.tsx` | Migreer subscription | Minder connections |
| 3 | `EmbeddedCalendarView.tsx` | Migreer subscription | Minder connections |
| 4 | `MyTasksFlowSection.tsx` | Voeg realtime toe | Live updates Kanban |
| 5 | `AppSidebar.tsx` | Migreer subscription | Error handling |
| 6 | `useMySubtasks.ts` | Migreer subscription | Error handling |
| 7 | `Kanban.tsx` | Voeg tasks subscription toe | Complete realtime |

---

## Verificatie Checklist

| Test | Verwacht Resultaat |
|------|-------------------|
| Open Dashboard, wijzig taak in andere tab | MyTasksFlowSection ververst binnen 200ms |
| Check console logs op CHANNEL_ERROR | Geen errors in normale werking |
| Open Network tab, check WebSocket frames | Significant minder duplicate messages |
| Bulk import 20 taken | 1 refetch na 200ms, niet 20 immediate |
| Verbinding verliest WiFi | Console logt CHANNEL_ERROR |

---

## Risico's en Mitigatie

| Risico | Mitigatie |
|--------|-----------|
| Breaking change bij migratie | Stapsgewijze implementatie per component |
| Performance regressie | Debounce voorkomt cascade updates |
| Realtime stopt na error | Logging maakt debugging mogelijk |

---

## Samenvatting Wijzigingen

| Categorie | Bestanden | Regels Code |
|-----------|-----------|-------------|
| Nieuw utility bestand | 1 | ~50 |
| Updates bestaande bestanden | 7 | ~100 |
| **Totaal** | **8** | **~150** |

**Resultaat**: Gestandaardiseerde, robuuste realtime implementatie met:
- 1 central utility hook
- Uniforme error handling
- Consistent 200ms debouncing
- Minder WebSocket connections

