

# Fix: Taak bewerken reset kolom naar "Nog Mee Starten"

## Oorzaak
In `TaskDialog.tsx` regel 294 staat:
```typescript
column_id: columnId || defaultBacklogColumnId,
```

Bij het **bewerken** van een bestaande taak is de `columnId` prop `undefined` (niet meegegeven door `TaskDetailModal`). Daardoor valt het terug op `defaultBacklogColumnId` (= BACKLOG / "Nog Mee Starten"), waardoor elke edit de taak terugzet naar de eerste kolom.

## Oplossing
Bij een **update** (`taskId` bestaat) moet `column_id` niet worden overschreven tenzij er expliciet een `columnId` prop is meegegeven. 

### Bestand: `src/components/TaskDialog.tsx`

**Regel 294** — Wijzig de update query:
```typescript
// VOOR (bug):
column_id: columnId || defaultBacklogColumnId,

// NA (fix):
...(columnId ? { column_id: columnId } : {}),
```

Dit zorgt ervoor dat bij een update de `column_id` alleen wordt gewijzigd als er expliciet een `columnId` prop is meegegeven. Bij een nieuwe taak (insert, regel 312) blijft de logica `columnId || defaultBacklogColumnId` correct.

## Impact
- 1 bestand, 1 regel gewijzigd
- Geen UI-wijzigingen nodig
- Bestaande kolompositie blijft behouden bij bewerken

