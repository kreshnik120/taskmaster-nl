
# Fix: Ontbrekende Items Unified Actie Systeem

Dit plan implementeert de 4 ontbrekende items uit de verificatie.

---

## Fix 1: TaskDetailModal - Reporter Info UI

### 1.1 Uitbreiden Task Interface (regel 76-93)

Voeg `reporter_id`, `created_at` en `reporter` toe aan de interface:

```typescript
interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  start_at: string | null;
  due_at: string | null;
  next_action: string | null;
  assignee_id: string | null;
  application_id: string | null;
  recruitment_action_type: string | null;
  category?: string | null;
  interview_details?: InterviewDetails | null;
  profiles: {
    name: string | null;
    email: string | null;
  } | null;
  // NIEUW: Reporter info
  reporter_id?: string | null;
  created_at?: string;
  reporter?: {
    name: string | null;
    email: string | null;
  } | null;
}
```

### 1.2 Reporter Info toevoegen in UI (na regel 996)

In de "Basis informatie" sectie, voeg toe NA de assignee info:

```tsx
{/* Reporter/Creator Info */}
{task.reporter_id && (
  <>
    <span className="text-sm text-muted-foreground/80">Aangemaakt door</span>
    <div className="flex items-center gap-2">
      <User className="h-4 w-4 text-muted-foreground/60" />
      <span className="text-sm font-medium">
        {task.reporter?.name || task.reporter?.email || 'Onbekend'}
      </span>
      {task.created_at && (
        <span className="text-xs text-muted-foreground">
          op {format(parseISO(task.created_at), "d MMM yyyy 'om' HH:mm", { locale: nl })}
        </span>
      )}
    </div>
  </>
)}
```

---

## Fix 2: Verwijder Dubbele Subtask Logging (regels 661-674)

De handmatige insert naar `task_action_history` bij subtask voltooiing moet verwijderd worden, omdat de database trigger `log_subtask_status_trigger` dit nu automatisch doet.

**Verwijder deze code:**
```typescript
// 3. Log naar action history voor audit trail
const { data: { user } } = await supabase.auth.getUser();
const completedSubtask = subtasks.find(s => s.id === subtaskId);

await supabase
  .from('task_action_history')
  .insert({
    task_id: task.id,
    action_text: `Subtaak voltooid: ${completedSubtask?.title || 'Onbekend'}`,
    action_type: 'status_change',
    completed_at: new Date().toISOString(),
    completed_by: user?.id,
    is_current: false
  });
```

**Houd wel:** toast en loadSubtasks/loadActionHistory calls.

---

## Fix 3: NotificationBell Filter - Voeg task_assigned toe

### 3.1 Update Query Filter (useUnreadNotifications.ts, regel 26)

Van:
```typescript
.in("notification_type", ["diploma_upgrade", "vog_verified", "subtask_assignment"])
```

Naar:
```typescript
.in("notification_type", ["diploma_upgrade", "vog_verified", "subtask_assignment", "task_assigned"])
```

### 3.2 Update Realtime Filter (regel 45)

Van:
```typescript
filter: "notification_type=in.(diploma_upgrade,vog_verified,subtask_assignment)",
```

Naar:
```typescript
filter: "notification_type=in.(diploma_upgrade,vog_verified,subtask_assignment,task_assigned)",
```

---

## Samenvatting Wijzigingen

| Bestand | Wijziging |
|---------|-----------|
| `src/components/TaskDetailModal.tsx` | Interface uitbreiden, reporter UI toevoegen, dubbele logging verwijderen |
| `src/hooks/useUnreadNotifications.ts` | `task_assigned` toevoegen aan query en realtime filter |

---

## Verwacht Resultaat Na Fixes

- ✅ Reporter naam zichtbaar in taakdetail ("Aangemaakt door: [naam]")
- ✅ Created_at datum zichtbaar ("op [datum]")
- ✅ Geen dubbele entries in actieverloop bij subtaak voltooien
- ✅ `task_assigned` notificaties verschijnen in NotificationBell
