
# Prompt #73 — TODO Handlers Implementeren

## Overzicht

6 TODO placeholders vervangen door werkende code in 2 bestanden, plus DONE toevoegen aan de bulk status opties.

---

## Bestand 1: src/components/TaskListView/TaskListView.tsx

### Nieuwe imports toevoegen (bovenaan)
- `supabase` van `@/integrations/supabase/client`
- `useToast` van `@/hooks/use-toast`
- `useQueryClient` van `@tanstack/react-query`
- `TaskDetailModal` van `@/components/TaskDetailModal`
- AlertDialog componenten van `@/components/ui/alert-dialog`

### Nieuwe state variabelen (in TaskListViewContent)
- `const { toast } = useToast()`
- `const queryClient = useQueryClient()`
- `const [editTask, setEditTask] = useState<TaskListTask | null>(null)` — voor TaskDetailModal
- `const [deleteTask, setDeleteTask] = useState<TaskListTask | null>(null)` — voor single delete AlertDialog
- `const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)` — voor bulk delete AlertDialog

### Handler 1: handleBulkStatusChange (regel 179-183)
Supabase update alle taken in `selectedIds` naar meegegeven status. Toast bij succes/fout. Invalidate `active-tasks`. clearSelection().

### Handler 2: handleBulkPriorityChange (regel 185-189)
Zelfde patroon als status, maar dan `priority` veld updaten.

### Handler 3: handleBulkDelete (regel 191-194)
Opent `bulkDeleteOpen` AlertDialog. Bij bevestiging: haal user op via `supabase.auth.getUser()`, soft delete met `deleted_at` + `deleted_by`, toast met undo actie die `deleted_at: null, deleted_by: null` terugzet. clearSelection().

### Handler 4: onEdit in SidePanel (regel 276-278)
`setEditTask(task)` en `setPanelTask(null)`. TaskDetailModal wordt gerenderd in de JSX.

### Handler 5: onDelete in SidePanel (regel 279-281)
`setDeleteTask(task)` en `setPanelTask(null)`. AlertDialog voor single delete met soft delete + undo toast.

### Nieuwe JSX elementen (voor sluitende `</div>` van className)
- `<TaskDetailModal>` — gecontroleerd door `editTask` state
- AlertDialog voor bulk delete (`bulkDeleteOpen`)
- AlertDialog voor single delete (`deleteTask`)

---

## Bestand 2: src/components/TaskCard.tsx

### Handler 6: handleReminderClick (regel 131-135)
- Nieuwe state: `const [reminderOpen, setReminderOpen] = useState(false)`
- Import: `useState` (al geimporteerd via React), `ReminderDialog` van `@/components/ReminderDialog`
- In handler: `setReminderOpen(true)` i.p.v. TODO
- Render `<ReminderDialog>` na de HoverCard sluittag

---

## Bestand 3: src/components/TaskListView/TaskListBulkActions.tsx

### DONE toevoegen aan STATUS_OPTIONS (regel 26)
Voeg `{ value: 'DONE', label: 'Afgerond' }` toe na REVIEW.

---

## Technisch Overzicht

| Bestand | Wijzigingen |
|---------|-------------|
| `TaskListView.tsx` | 5 TODO handlers + imports + state + 3 JSX componenten |
| `TaskCard.tsx` | 1 TODO handler + import + state + ReminderDialog render |
| `TaskListBulkActions.tsx` | 1 regel: DONE toevoegen aan STATUS_OPTIONS |

Totaal: 3 bestanden, 6 TODO's opgelost, geen layout/UI wijzigingen aan bestaande componenten.
