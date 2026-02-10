
# Subtaken vereenvoudigen in taakkaarten

## Wat wordt er gedaan

De subtaak-informatie in TaskCard.tsx (Kanban) en TaskItem.tsx (Lijst) wordt vervangen door een compacte counter badge. Detail-informatie blijft beschikbaar via hover (HoverCard) en klik (TaskDetailModal).

## Wijzigingen

### 1. TaskCard.tsx (regels 206-265)

Het volledige subtaak-blok (header, progress bar, actieve indicator, subtaak titels, overflow tekst) wordt vervangen door:

```
<div className="mt-1.5 flex items-center gap-1 text-muted-foreground/60">
  <ListChecks className="h-3 w-3" />
  <span className="text-[10px]">{completedCount}/{subtasks.length}</span>
</div>
```

### 2. TaskItem.tsx (regels 117-143)

Het subtaak-blok (Progress bar, "X van Y stappen voltooid" tekst, actieve subtaak indicator) wordt vervangen door:

```
<div className="mt-1.5 flex items-center gap-1 text-muted-foreground/60">
  <ListChecks className="h-3 w-3" />
  <span className="text-[10px]">{subtasksCompleted}/{subtasksTotal}</span>
</div>
```

Daarnaast wordt de `Progress` import en de `SUBTASK_TOKENS` import verwijderd uit TaskItem.tsx (niet meer nodig).

### Wat NIET verandert

- HoverCard in TaskCard.tsx (subtaak-detail bij hover)
- TaskDetailModal (volledige subtaak-weergave)
- KanbanColumn orphan subtasks
- Geen database wijzigingen
