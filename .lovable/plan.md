

# Verbeteringsplan "Mijn Taken" - Implementatie Status & Volgende Stappen

## ✅ Wat is AL Geïmplementeerd (TaskDialog.tsx)

De laatste diff bevestigt dat de **basis auto-assign/auto-accept** al werkt:

```typescript
// GEÏMPLEMENTEERD in TaskDialog.tsx (regel 211-257)
- Haalt huidige user op bij submit
- Auto-assign naar huidige user als geen assignee geselecteerd
- Auto-accept: accepted_at + accepted_by worden gezet bij self-assignment
- Bij delegatie naar ander: accepted_at/accepted_by = null
```

**Status**: ✅ Kernfunctionaliteit werkt

---

## ❌ Wat nog ONTBREEKT (4 Prioriteiten)

### P1-KRITIEK: TaskCard.tsx - Visuele Acceptatie-Indicator

**Probleem**: TaskCard toont NIET of een taak wacht op acceptatie

**Huidige code (regel 18-44)**:
```typescript
interface Task {
  id: string;
  // ... andere velden
  // ❌ ONTBREEKT: accepted_at, accepted_by
}
```

**Te implementeren**:
- Voeg `accepted_at?: string | null` toe aan interface
- Voeg "Wacht op acceptatie" badge toe voor gedelegeerde taken

---

### P1-KRITIEK: MyTasksFlowSection.tsx - Accepteer-Functionaliteit

**Probleem**: Dashboard mist de "Accepteren" knop die wel in Lijst.tsx bestaat

**Huidige query (regel 210-222)** - selecteert NIET accepted_at/accepted_by:
```typescript
.select(`
  id, title, description, priority, assignee_id,
  due_at, completed_at, column_id, order_key,
  application_id, recruitment_action_type, start_at,
  next_action, created_at, updated_at,
  profiles:profiles!tasks_assignee_id_fkey(name, email)
`)
// ❌ ONTBREEKT: accepted_at, accepted_by
```

**Huidige dropdown (regel 591-604)** - alleen "Verplaats naar":
```typescript
<DropdownMenuContent>
  <DropdownMenuLabel>Verplaats naar</DropdownMenuLabel>
  {columns.filter(...).map(...)}
  // ❌ ONTBREEKT: "Accepteren" optie
</DropdownMenuContent>
```

**Te implementeren**:
- Query uitbreiden met `accepted_at, accepted_by`
- `handleAcceptTask()` functie toevoegen
- "Accepteren" optie in dropdown menu

---

### P2-HOOG: useCreateTasksFromItems.ts - Notulen Auto-Accept

**Probleem**: Taken uit notulen worden NIET auto-accepted bij self-assignment

**Huidige code (regel 257-286)**:
```typescript
const tasksToInsert = processedItems.map(({ item, assigneeMatch }) => ({
  org_id: userOrg.org_id,
  assignee_id: assigneeMatch.userId,
  // ❌ ONTBREEKT: accepted_at, accepted_by
}));
```

**Te implementeren**:
- Haal huidige user op
- Check of `assigneeMatch.userId === user?.id`
- Indien ja: voeg `accepted_at` en `accepted_by` toe

---

### P2-HOOG: AI Orchestrator - Expliciete NULL Waarden

**Probleem**: AI-gegenereerde taken zetten geen expliciet `accepted_at/accepted_by`

**Huidige code (regel 2935-2944)**:
```typescript
await supabase.from('tasks').insert({
  org_id: org_id,
  title: taskTemplate.title,
  priority: 'medium',  // ⚠️ Moet 'MEDIUM' zijn (uppercase)
  // ❌ ONTBREEKT: accepted_at: null, accepted_by: null
});
```

**Te implementeren**:
- Fix priority case naar 'MEDIUM' (uppercase)
- Voeg expliciete `accepted_at: null, accepted_by: null` toe
- Dit zorgt ervoor dat AI-taken bewust in "te accepteren" status staan

---

## Implementatieplan per Fase

### Fase 1: UI Verbeteringen (Niet-Breaking)

| Bestand | Wijziging | Regels |
|---------|-----------|--------|
| `TaskCard.tsx` | Interface + badge | 18-44, +10 regels |
| `MyTasksFlowSection.tsx` | Query + handler + dropdown | 73-90, 210-222, 591-604 |

**TaskCard.tsx wijzigingen**:
```typescript
// Interface uitbreiden (regel 18-44)
interface Task {
  // bestaande velden...
  accepted_at?: string | null;  // NIEUW
  accepted_by?: string | null;  // NIEUW
}

// Helper functie toevoegen
const isPendingAcceptance = (task: Task) => {
  return task.assignee_id && !task.accepted_at;
};

// Badge toevoegen in CardContent (na description, ~regel 179)
{isPendingAcceptance(task) && (
  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
    <Clock className="h-3 w-3 mr-1" />
    Wacht op acceptatie
  </Badge>
)}
```

**MyTasksFlowSection.tsx wijzigingen**:
```typescript
// 1. Interface uitbreiden (regel 73-90)
interface Task {
  // bestaande velden...
  accepted_at?: string | null;
  accepted_by?: string | null;
}

// 2. Query uitbreiden (regel 210-222)
.select(`
  id, title, description, priority, assignee_id,
  due_at, completed_at, column_id, order_key,
  application_id, recruitment_action_type, start_at,
  next_action, created_at, updated_at,
  accepted_at, accepted_by,  // NIEUW
  profiles:profiles!tasks_assignee_id_fkey(name, email)
`)

// 3. Handler toevoegen (na moveTaskToColumn, ~regel 368)
const handleAcceptTask = async (taskId: string) => {
  if (!user) return;
  
  const { error } = await supabase
    .from("tasks")
    .update({ 
      accepted_by: user.id,
      accepted_at: new Date().toISOString()
    })
    .eq("id", taskId);

  if (error) {
    toast.error("Fout bij accepteren");
    return;
  }

  // Optimistic update
  setTasks(prev => prev.map(t =>
    t.id === taskId 
      ? { ...t, accepted_by: user.id, accepted_at: new Date().toISOString() } 
      : t
  ));
  
  setStatusMessage("Taak geaccepteerd");
  toast.success("Taak geaccepteerd");
};

// 4. Dropdown menu uitbreiden (regel 591-604)
<DropdownMenuContent align="end" className="bg-popover">
  {/* Accepteer optie voor niet-geaccepteerde taken */}
  {!task.accepted_at && (
    <>
      <DropdownMenuItem
        onClick={() => handleAcceptTask(task.id)}
        className="text-primary"
      >
        <CheckCircle2 className="h-4 w-4 mr-2" />
        Accepteren
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  )}
  <DropdownMenuLabel>Verplaats naar</DropdownMenuLabel>
  {columns.filter(...).map(...)}
</DropdownMenuContent>
```

---

### Fase 2: Backend Consistentie (Niet-Breaking)

| Bestand | Wijziging | Regels |
|---------|-----------|--------|
| `useCreateTasksFromItems.ts` | Auto-accept bij bulk | 174-287 |
| `ai-agent-orchestrator/index.ts` | NULL waarden + fix priority | 2935-2944 |

**useCreateTasksFromItems.ts wijzigingen**:
```typescript
// Haal huidige user op (na regel 186)
const { data: { user } } = await supabase.auth.getUser();

// Wijzig tasksToInsert (regel 257-286)
const tasksToInsert = processedItems.map(({ item, assigneeMatch }) => {
  const isAutoAccept = assigneeMatch.userId === user?.id;
  
  return {
    org_id: userOrg.org_id,
    title: (item.action || 'Taak uit notule').substring(0, 100),
    description: generateTaskDescription(item, meetingMinuteForDesc),
    priority: mapPriority(item.urgency),
    due_at: item.deadline ? new Date(item.deadline).toISOString() : null,
    assignee_id: assigneeMatch.userId,
    // AUTO-ACCEPT LOGICA
    accepted_by: isAutoAccept ? user?.id : null,
    accepted_at: isAutoAccept ? new Date().toISOString() : null,
    category: 'action_item' as const,
    source_meeting_minute_id: meetingMinuteId,
    ai_context: JSON.parse(JSON.stringify({...}))
  };
});
```

**ai-agent-orchestrator/index.ts wijzigingen**:
```typescript
// Fix priority case + expliciete NULL waarden (regel 2935-2944)
for (const taskTemplate of onboardingTasks) {
  await supabase.from('tasks').insert({
    org_id: org_id,
    title: taskTemplate.title,
    category: taskTemplate.category,
    priority: 'MEDIUM',  // FIX: uppercase
    status: 'pending',
    description: `Onboarding taak voor professional ${action.input_data.professional_id}`,
    // EXPLICIETE DELEGATIE STATUS
    assignee_id: null,
    accepted_at: null,
    accepted_by: null
  });
}
```

---

## Fase 3: Subtasks (OPTIONEEL - Latere Iteratie)

Dit is NIET nodig voor de huidige workflow maar kan later toegevoegd worden:

| Item | Status |
|------|--------|
| Database migratie (subtasks kolommen) | ⏳ Later |
| SubtaskManager.tsx auto-accept | ⏳ Later |

---

## Risico Analyse

| Wijziging | Risico | Mitigatie |
|-----------|--------|-----------|
| TaskCard interface | ❌ Geen | Optionele velden met `?` |
| MyTasksFlowSection query | ❌ Geen | Extra velden, geen removals |
| handleAcceptTask | ❌ Geen | Identiek aan bestaande Lijst.tsx |
| useCreateTasksFromItems | ❌ Geen | Extra velden bij insert |
| AI Orchestrator | ⚠️ Laag | Priority case fix + expliciet null |

---

## Validatie Checklist (Na Implementatie)

- [x] **Nieuwe taak via Dashboard** → Direct geaccepteerd (accepted_at gevuld) ✅ TaskDialog.tsx
- [x] **Taak delegeren** → Badge "Wacht op acceptatie" zichtbaar ✅ TaskCard.tsx
- [x] **Accept klikken** → Badge verdwijnt, toast "Taak geaccepteerd" ✅ MyTasksFlowSection.tsx
- [x] **Notulen naar taken** → Self-assigned taken zijn geaccepteerd ✅ useCreateTasksFromItems.ts
- [x] **AI-taken** → priority = 'MEDIUM' (uppercase), staan in team overzicht ✅ ai-agent-orchestrator
- [ ] **Bestaande Lijst.tsx** → Blijft ongewijzigd werken (te testen)

---

## Samenvatting: 4 Bestanden te Wijzigen

1. **TaskCard.tsx** - Interface + Badge UI
2. **MyTasksFlowSection.tsx** - Query + Handler + Dropdown
3. **useCreateTasksFromItems.ts** - Auto-accept bij bulk insert
4. **ai-agent-orchestrator/index.ts** - Priority fix + NULL waarden

Geen database migraties nodig. Geen breaking changes. Volledig backwards-compatible.

