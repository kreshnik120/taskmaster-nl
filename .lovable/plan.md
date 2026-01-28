
# Sidebar Refactoring Plan: Verwijder "Kanban bord" Menu Item

## Overzicht

Dit plan implementeert de migratie van task-navigatie naar het Dashboard als centrale hub. De /kanban pagina blijft behouden voor team-breed overzicht, maar wordt verwijderd uit de sidebar. Alle task-specifieke navigatie gaat via dashboard met `taskId` URL parameter.

---

## Wijzigingen Overzicht

| # | Bestand | Actie | Regels |
|---|---------|-------|--------|
| 1 | `AppSidebar.tsx` | Verwijder menu item | 41-44 |
| 2 | `UnifiedDashboard.tsx` | Voeg taskId handling toe | imports + state + useEffect |
| 3 | `MyTasksFlowSection.tsx` | Update 3 link teksten | 335, 351, 442 |
| 4 | `UpcomingRemindersWidget.tsx` | Update navigatie | 128 |
| 5 | `UpcomingTasksList.tsx` | Update handleClick | 35 |
| 6 | `OverdueTasksList.tsx` | Update handleClick | 21 |
| 7 | `ReminderNotification.tsx` | Update handleGoToTask | 62 |
| 8 | `Bijlagen.tsx` | Update navigateToTask | 291-293 |

---

## Gedetailleerde Wijzigingen

### 1. AppSidebar.tsx
**Actie:** Verwijder "Kanban bord" menu item uit menuGroups array

```typescript
// VERWIJDER regels 41-44:
{
  title: "Kanban bord",
  url: "/kanban",
  icon: Kanban
},
```

De Kanban icon import blijft behouden (wordt mogelijk elders gebruikt).

---

### 2. UnifiedDashboard.tsx
**Actie:** Voeg taskId URL parameter handling + TaskDetailModal toe

**Nieuwe imports:**
```typescript
import { TaskDetailModal } from "@/components/TaskDetailModal";
```

**Nieuwe state:**
```typescript
const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
const [taskModalOpen, setTaskModalOpen] = useState(false);
```

**Nieuwe useEffect voor URL parameter:**
```typescript
useEffect(() => {
  const taskId = searchParams.get('taskId');
  if (taskId) {
    setSelectedTaskId(taskId);
    setTaskModalOpen(true);
    // Switch to mijn-werk tab if not already there
    if (activeTab !== 'mijn-werk') {
      setSearchParams({ tab: 'mijn-werk', taskId });
    }
  }
}, [searchParams]);
```

**Callback functies:**
```typescript
const handleTaskModalClose = (open: boolean) => {
  setTaskModalOpen(open);
  if (!open) {
    setSelectedTaskId(null);
    // Remove taskId from URL, keep tab
    setSearchParams({ tab: activeTab });
  }
};

const handleTaskUpdated = () => {
  // Refresh via real-time subscription
};
```

**TaskDetailModal in JSX (voor sluiting `</div>`):**
```tsx
{selectedTaskId && (
  <TaskDetailModal
    task={{ id: selectedTaskId } as any}
    open={taskModalOpen}
    onOpenChange={handleTaskModalClose}
    onTaskUpdated={handleTaskUpdated}
  />
)}
```

---

### 3. MyTasksFlowSection.tsx
**Actie:** Update 3 link teksten

| Locatie | Van | Naar |
|---------|-----|------|
| Regel 335 (header button) | `Open volledig Kanban` | `Bekijk alle team taken` |
| Regel 351 (empty state) | `Ga naar Kanban bord` | `Bekijk alle team taken` |
| Regel 442 (overflow) | `Bekijk meer ({overflow})` | `+{overflow} meer in team overzicht` |

---

### 4. UpcomingRemindersWidget.tsx
**Actie:** Update navigatie (regel 128)

```typescript
// Van:
onClick={() => navigate(`/kanban/${reminder.task_id}`)}

// Naar:
onClick={() => navigate(`/dashboard?tab=mijn-werk&taskId=${reminder.task_id}`)}
```

---

### 5. UpcomingTasksList.tsx
**Actie:** Update handleClick functie (regel 35)

```typescript
// Van:
navigate(`/kanban/${taskId}`);

// Naar:
navigate(`/dashboard?tab=mijn-werk&taskId=${taskId}`);
```

---

### 6. OverdueTasksList.tsx
**Actie:** Update handleClick functie (regel 21)

```typescript
// Van:
navigate(`/kanban/${taskId}`);

// Naar:
navigate(`/dashboard?tab=mijn-werk&taskId=${taskId}`);
```

---

### 7. ReminderNotification.tsx
**Actie:** Update handleGoToTask functie (regel 62)

```typescript
// Van:
navigate(`/kanban/${reminder.task_id}`);

// Naar:
navigate(`/dashboard?tab=mijn-werk&taskId=${reminder.task_id}`);
```

---

### 8. Bijlagen.tsx
**Actie:** Update navigateToTask functie (regels 291-293)

```typescript
// Van:
const navigateToTask = (taskId: string) => {
  navigate(`/kanban/${taskId}`);
};

// Naar:
const navigateToTask = (taskId: string) => {
  navigate(`/dashboard?tab=mijn-werk&taskId=${taskId}`);
};
```

---

## Niet Wijzigen

| Bestand | Reden |
|---------|-------|
| `src/App.tsx` | Route `/kanban/:taskId?` BEHOUDEN voor backward compatibility |
| `src/pages/Kanban.tsx` | Pagina BEHOUDEN - team overzicht |
| Alle andere sidebar items | Alleen "Kanban bord" verwijderen |

---

## Navigatie Flow Na Implementatie

```text
┌─────────────────────────────────────────────────────────────────┐
│ PRIMAIRE FLOW (nieuw)                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Sidebar: Dashboard ───────> /dashboard?tab=mijn-werk           │
│                                      │                           │
│                                      v                           │
│                              MyTasksFlowSection                  │
│                                      │                           │
│                          ┌───────────┴───────────┐              │
│                          │                       │              │
│                    Klik taak              "Bekijk alle          │
│                          │                team taken"           │
│                          v                       │              │
│         /dashboard?tab=mijn-werk          ┌─────v─────┐        │
│         &taskId=abc123                    │  /kanban   │        │
│                │                          │ (alle team │        │
│                v                          │   taken)   │        │
│        TaskDetailModal                    └───────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technische Details

### TaskDetailModal Props
Het component accepteert een task object. Voor deeplinks laden we alleen het ID, het modal haalt zelf de volledige task data op:
```typescript
task={{ id: selectedTaskId } as any}
```

### URL Parameter Beheer
- Bij openen: `?tab=mijn-werk&taskId=abc123`
- Bij sluiten: `?tab=mijn-werk` (taskId verwijderd)
- Tab switch: taskId blijft behouden in URL

---

## Acceptatie Criteria

**Functioneel:**
- "Kanban bord" NIET zichtbaar in sidebar
- Dashboard is primaire entry point voor taken
- "Bekijk alle team taken" link werkt naar /kanban
- Klik op taak in widgets opent TaskDetailModal in dashboard
- URL `/dashboard?tab=mijn-werk&taskId=abc123` opent direct taak modal
- Na modal sluiten: taskId verdwijnt uit URL, tab blijft

**Technisch:**
- Geen TypeScript errors
- Geen console errors
- Route /kanban blijft werken (backward compatibility)
