
# Quick Fixes: Kalender, Notificatie Scroll & Eigen Notificaties

## Fix 1: Kalender week begint op maandag

**Bestand:** `src/components/ui/calendar.tsx`

**Wijziging (3 regels):**
1. Import toevoegen: `import { nl } from "date-fns/locale";`
2. Functie-signature uitbreiden: destructure `locale` uit props
3. Op DayPicker: `locale={locale ?? nl}`

Dit fixt automatisch alle 6 Calendar-instanties die geen locale meegeven. De 6 die al `locale={nl}` gebruiken blijven ongewijzigd werken.

---

## Fix 2: Notificatie belletje scrollbaar

**Bestand:** `src/components/notifications/NotificationBell.tsx`

**Wijzigingen (2 regels):**
1. `PopoverContent`: className wordt `"w-80 p-0 max-h-[70vh]"`
2. `ScrollArea`: className wordt `"max-h-[calc(70vh-52px)]"`

Dit zorgt dat de header vast blijft staan en de lijst scrollbaar wordt bij veel notificaties.

---

## Fix 3: Eigen notificaties filteren

### Stap A: Database triggers updaten (SQL migratie)

**`notify_subtask_assignment()`** - voeg `triggered_by` toe aan metadata:
```sql
metadata = jsonb_build_object(
  'subtask_id', NEW.id,
  'task_id', NEW.task_id,
  'subtask_title', NEW.title,
  'due_at', NEW.due_at,
  'triggered_by', auth.uid()   -- NIEUW
)
```

**`notify_task_assignment()`** - voeg `triggered_by` toe (naast het bestaande `assigned_by` veld):
```sql
metadata = jsonb_build_object(
  'task_id', NEW.id,
  'task_title', NEW.title,
  'assigned_by', auth.uid(),
  'assigned_by_name', v_assigner_name,
  'triggered_by', auth.uid()   -- NIEUW (expliciet, voor consistentie)
)
```

### Stap B: Client-side filter

**Bestand:** `src/hooks/useUnreadNotifications.ts`

In de `queryFn`, na het ophalen van data:
1. Haal huidige user op: `const { data: { user } } = await supabase.auth.getUser()`
2. Filter resultaten: notificaties waar `metadata.triggered_by === user.id` worden uitgesloten
3. Voor `task_assigned`: check ook `metadata.assigned_by` (backward compatibility met bestaande notificaties)

---

## Technisch Overzicht

| Fix | Bestand(en) | Type wijziging |
|-----|-------------|----------------|
| 1 | `calendar.tsx` | 3 regels frontend |
| 2 | `NotificationBell.tsx` | 2 regels CSS |
| 3a | SQL migratie | 2 trigger updates |
| 3b | `useUnreadNotifications.ts` | Filter logica |

## Geen destructieve database wijzigingen
- Fix 3 voegt alleen een extra key toe aan bestaande JSONB metadata
- Bestaande notificaties zonder `triggered_by` worden gewoon getoond (backward compatible)
