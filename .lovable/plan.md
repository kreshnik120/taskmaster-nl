
# Fase 18: Mijn Werk — Drag & Slide Agent Specialisatie

## Executive Summary

Na grondige audit van "Mijn Werk" (drag-and-drop & horizontal slide) in combinatie met het AI Agent framework, blijkt dat de **visuele functionaliteit compleet** is, maar de **AI-agent integratie ontbreekt**. De `task_agent` is geconfigureerd maar kan geen drag/slide acties uitvoeren of ondersteunen. Dit plan transformeert de passive task_agent naar een **proactieve flow-specialist**.

---

## Huidige Staat Audit

### Drag & Drop (100% Visueel Werkend)
| Component | Status | Details |
|-----------|--------|---------|
| `@dnd-kit/core` + `@dnd-kit/sortable` | OK | PointerSensor met 10px threshold |
| `DragOverlay` | OK | Gebruikt `glass-drag-overlay-enhanced` |
| `dnd-dragging` CSS guard | OK | Bevriest hover transforms |
| Optimistic update | OK | Lokale state + DB sync |
| Accessibility | OK | ARIA + keyboard dropdown alternative |

### Horizontal Slide (100% Visueel Werkend)
| Feature | Status | Details |
|---------|--------|---------|
| `overflow-x-auto` | OK | Scrollbaar op alle devices |
| `snap-x snap-mandatory` | OK | Mobiel snap-to-column |
| `md:snap-none` | OK | Desktop vrij scrollen |
| Scrollbar styling | OK | `scrollbar-thin scrollbar-thumb-border` |

### Agent Integratie (Kritische Gaps)
| Aspect | Status | Probleem |
|--------|--------|----------|
| `task_agent` config | OK | Gekoppeld aan `/mijn-werk` via Fase 17 |
| Drag context passing | ONTBREEKT | Agent weet niet wanneer/wat gesleept wordt |
| Move suggestions | ONTBREEKT | Geen AI-suggesties voor optimale kolom |
| Batch operations | ONTBREEKT | Geen "verplaats alle HIGH naar DOING" |
| Predictive reorder | ONTBREEKT | AI kan niet voorspellend herordenen |

---

## Verbeteringsplan: 4 Fasen

### Fase A: Task Move Intent Toevoegen

**Bestand:** `src/lib/agentIntents.ts`

**Nieuwe intent toevoegen aan ALL_INTENTS:**

```typescript
// Task Agent - Flow Operations
move_task: {
  id: "move_task",
  label: "Taak verplaatsen",
  description: "Verplaats een taak naar een andere kolom",
  icon: "➡️",
  agent: "task_agent",
  requiresPayload: ["task_id", "target_column"],
  examples: ["Zet deze taak op doing", "Verplaats naar review"],
},
bulk_move_tasks: {
  id: "bulk_move_tasks",
  label: "Taken bulk verplaatsen",
  description: "Verplaats meerdere taken tegelijk",
  icon: "📦",
  agent: "task_agent",
  requiresPayload: ["filter_criteria", "target_column"],
  examples: ["Alle urgente taken naar doing", "Verplaats mijn blocked taken"],
},
suggest_task_flow: {
  id: "suggest_task_flow",
  label: "Flow optimalisatie",
  description: "Krijg AI-suggesties voor taakverplaatsingen",
  icon: "💡",
  agent: "task_agent",
  examples: ["Optimaliseer mijn workflow", "Welke taken kan ik afronden?"],
},
```

---

### Fase B: Mijn Werk Context Uitbreiden

**Bestand:** `src/lib/agentIntents.ts`

**Update `/mijn-werk` config:**

```typescript
"/mijn-werk": {
  primaryAgent: "task_agent",
  intents: [
    ALL_INTENTS.create_task,
    ALL_INTENTS.update_task,
    ALL_INTENTS.prioritize,
    ALL_INTENTS.move_task,           // NIEUW
    ALL_INTENTS.bulk_move_tasks,     // NIEUW
    ALL_INTENTS.suggest_task_flow,   // NIEUW
    ALL_INTENTS.schedule_meeting,
  ],
  contextFields: [
    "user_id", 
    "selected_task_id",
    "active_column_id",      // NIEUW: huidige kolom context
    "dragging_task_id",      // NIEUW: actief gesleepte taak
    "visible_task_ids",      // NIEUW: zichtbare taken voor suggesties
    "column_task_counts",    // NIEUW: verdeling per kolom
  ],
},
```

---

### Fase C: Drag Context Hook Toevoegen

**Nieuw bestand:** `src/hooks/useDragContext.ts`

```typescript
import { useState, useCallback, useContext, createContext } from 'react';

interface DragContextData {
  isDragging: boolean;
  draggedTaskId: string | null;
  sourceColumn: string | null;
  potentialTargets: string[];
  aiSuggestion: string | null;
}

interface DragContextActions {
  startDrag: (taskId: string, columnId: string) => void;
  endDrag: () => void;
  setAISuggestion: (suggestion: string | null) => void;
}

const DragContext = createContext<DragContextData & DragContextActions | null>(null);

export function useDragContext() {
  const context = useContext(DragContext);
  if (!context) {
    throw new Error('useDragContext must be used within DragContextProvider');
  }
  return context;
}

export function DragContextProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DragContextData>({
    isDragging: false,
    draggedTaskId: null,
    sourceColumn: null,
    potentialTargets: [],
    aiSuggestion: null,
  });

  const startDrag = useCallback((taskId: string, columnId: string) => {
    setState({
      isDragging: true,
      draggedTaskId: taskId,
      sourceColumn: columnId,
      potentialTargets: [], // Populated by AI
      aiSuggestion: null,
    });
  }, []);

  const endDrag = useCallback(() => {
    setState({
      isDragging: false,
      draggedTaskId: null,
      sourceColumn: null,
      potentialTargets: [],
      aiSuggestion: null,
    });
  }, []);

  const setAISuggestion = useCallback((suggestion: string | null) => {
    setState(prev => ({ ...prev, aiSuggestion: suggestion }));
  }, []);

  return (
    <DragContext.Provider value={{ ...state, startDrag, endDrag, setAISuggestion }}>
      {children}
    </DragContext.Provider>
  );
}
```

---

### Fase D: MyTasksFlowSection Agent Integratie

**Bestand:** `src/components/dashboard/MyTasksFlowSection.tsx`

**Wijzigingen:**

1. **Import useAgentRouter hook**
```typescript
import { useAgentRouter } from '@/hooks/useAgentRouter';
```

2. **Initialiseer in component**
```typescript
const { 
  executeIntent, 
  availableIntents,
  detectIntent,
  pageConfig 
} = useAgentRouter({
  pageContext: {
    active_column_id: activeTask?.column_id,
    visible_task_ids: tasks.map(t => t.id),
    column_task_counts: columns.reduce((acc, col) => ({
      ...acc,
      [col.id]: getTasksForColumn(col.id).length
    }), {}),
  },
  onSuccess: (result) => {
    if (result.action_taken?.includes('verplaatst')) {
      loadData(); // Refresh na AI-actie
    }
  }
});
```

3. **AI Quick Actions in Header toevoegen**
```tsx
{/* AI Flow Actions */}
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="sm" className="gap-2 btn-glass-outline">
      <Sparkles className="h-4 w-4" />
      AI Acties
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent className="glass-layer-2">
    <DropdownMenuItem onClick={() => executeIntent('suggest_task_flow')}>
      <Lightbulb className="h-4 w-4 mr-2" />
      Optimaliseer mijn flow
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => executeIntent('bulk_move_tasks', { 
      filter_criteria: { priority: 'HIGH' }, 
      target_column: 'DOING' 
    })}>
      <Zap className="h-4 w-4 mr-2" />
      Urgente taken → Doing
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={() => executeIntent('prioritize')}>
      <Target className="h-4 w-4 mr-2" />
      Auto-prioriteren
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

4. **Context passing bij drag**
```typescript
const handleDragStart = (event: DragStartEvent) => {
  document.documentElement.classList.add('dnd-dragging');
  const task = tasks.find(t => t.id === event.active.id);
  if (task) {
    setActiveTask(task);
    // Pass context to agent for suggestions
    executeIntent('suggest_task_flow', {
      dragging_task_id: task.id,
      source_column: task.column_id,
    }).then(result => {
      if (result.suggestions?.length) {
        // Could show inline suggestion tooltip
        console.log('AI suggestion:', result.suggestions[0]);
      }
    });
  }
};
```

---

## Visueel Diagram: Agent Flow Integratie

```text
┌──────────────────────────────────────────────────────────────┐
│  MIJN WERK - DRAG & SLIDE MET AI AGENT                       │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  [+ Taak] [Sorteer ▼] [🔍 Zoeken] [✨ AI Acties ▼]      │ │
│  │                                    ┌─────────────────┐  │ │
│  │                                    │ 💡 Optimaliseer │  │ │
│  │                                    │ ⚡ Urgent→Doing │  │ │
│  │                                    │ 🎯 Prioriteren  │  │ │
│  │                                    └─────────────────┘  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│  │ BACKLOG │ │  READY  │ │  DOING  │ │ BLOCKED │ │ REVIEW  │ │
│  │   (3)   │ │   (5)   │ │   (2)   │ │   (1)   │ │   (4)   │ │
│  │         │ │         │ │         │ │         │ │         │ │
│  │ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │ │
│  │ │Task │ │ │ │Task │ │ │ │Task │ │ │ │Task │ │ │ │Task │ │ │
│  │ └──╪──┘ │ │ └─────┘ │ │ └─────┘ │ │ └─────┘ │ │ └─────┘ │ │
│  │    │    │ │         │ │    ▲    │ │         │ │         │ │
│  │ ═══╪════│ │═════════│ │════╪════│ │═════════│ │═════════│ │
│  │    │    │ │         │ │    │    │ │         │ │         │ │
│  │    └────┼─┼─────────┼─┼────┘    │ │         │ │         │ │
│  │         │ │  DRAG   │ │         │ │         │ │         │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │
│                                                              │
│  ╔═══════════════════════════════════════════════════════╗   │
│  ║ 💡 AI Suggestie: "Deze taak past beter in REVIEW -    ║   │
│  ║    je hebt al 2 taken in DOING en deadline is morgen" ║   │
│  ╚═══════════════════════════════════════════════════════╝   │
│                                                              │
│  ← SWIPE (mobiel) →                                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Bestanden Overzicht

| Bestand | Actie | Wijzigingen |
|---------|-------|-------------|
| `src/lib/agentIntents.ts` | EDIT | +3 nieuwe intents, update /mijn-werk config |
| `src/hooks/useDragContext.ts` | CREATE | Nieuw context provider voor drag state |
| `src/components/dashboard/MyTasksFlowSection.tsx` | EDIT | +useAgentRouter, +AI Actions dropdown, +drag context |

**Totaal: 2 bestanden bewerken, 1 nieuw bestand**

---

## Acceptatiecriteria

1. `move_task`, `bulk_move_tasks`, `suggest_task_flow` intents beschikbaar
2. `/mijn-werk` config bevat alle flow-gerelateerde intents
3. AI Actions dropdown zichtbaar in MyTasksFlowSection header
4. Drag start triggert optioneel AI suggestie (non-blocking)
5. Context fields correct doorgegeven aan agent router
6. Geen regressie in bestaande drag & slide functionaliteit
7. WCAG 2.1 AA compliant (alle nieuwe controls keyboard accessible)

---

## Toekomstige Uitbreidingen (Niet in Scope)

- **Real-time AI suggesties** tijdens drag (WebSocket)
- **Voice control** voor hands-free task management
- **Gesture recognition** voor touch-optimized flow
- **Predictive task completion** timing
- **Team-aware suggestions** (wie is beschikbaar)

---

## Technische Notities

### Waarom Non-Blocking AI Calls?

Drag-and-drop moet instant voelen (<100ms). AI suggesties worden:
1. Asynchroon gefetched na dragStart
2. Getoond in non-intrusive tooltip/banner
3. Niet blocking voor de drop actie

### Context Fields Rationale

| Field | Doel |
|-------|------|
| `active_column_id` | Weet waar focus ligt |
| `dragging_task_id` | Real-time drag awareness |
| `visible_task_ids` | Scope voor bulk operations |
| `column_task_counts` | Workload balancing suggesties |

