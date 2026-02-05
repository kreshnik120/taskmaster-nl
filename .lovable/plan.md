
# Unified Actie Systeem - Implementatieplan

## Overzicht

Dit plan implementeert een complete audit trail voor taken met automatische logging en notificaties bij toewijzingen en wijzigingen.

---

## Fase 1: Database Migratie

Voer de volledige SQL migratie uit die de volgende elementen bevat:

| Component | Beschrijving |
|-----------|--------------|
| **Constraint uitbreiding** | `action_type` CHECK voor nieuwe types: `description_change`, `assignment_change`, `attachment_added`, `attachment_removed`, `task_created` |
| **Metadata kolom** | JSONB kolom voor extra context per actie |
| **5 nieuwe triggers** | `notify_task_assignment`, `log_task_description_change`, `log_attachment_added`, `log_attachment_removed`, `log_subtask_status_change` |
| **2 indexes** | Performance indexes op `action_type` en `created_at` |

De migratie zorgt ervoor dat:
- Toewijzing wijzigingen automatisch een notificatie sturen naar de nieuwe assignee
- Beschrijving wijzigingen, bijlage toe/verwijderingen en subtaak status wijzigingen automatisch in het actieverloop verschijnen

---

## Fase 2: UI Wijzigingen

### 2.1 ActionTimeline - Iconen per Action Type

**Bestand:** `src/components/ActionTimeline.tsx`

Nieuwe imports toevoegen:
```typescript
import { 
  MessageSquare, 
  FileText, 
  UserPlus, 
  Paperclip, 
  FileX 
} from "lucide-react";
```

Nieuwe functie voor icoon mapping:
```typescript
const getActionIcon = (actionType: string) => {
  switch (actionType) {
    case 'followup': return <ArrowRight className="h-4 w-4 text-orange-600" />;
    case 'note': return <MessageSquare className="h-4 w-4 text-gray-600" />;
    case 'status_change': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'description_change': return <FileText className="h-4 w-4 text-blue-600" />;
    case 'assignment_change': return <UserPlus className="h-4 w-4 text-purple-600" />;
    case 'attachment_added': return <Paperclip className="h-4 w-4 text-cyan-600" />;
    case 'attachment_removed': return <FileX className="h-4 w-4 text-red-600" />;
    case 'task_created': return <Plus className="h-4 w-4 text-emerald-600" />;
    default: return <Circle className="h-4 w-4 text-gray-400" />;
  }
};
```

Update de `ActionHistoryItem` interface:
```typescript
export interface ActionHistoryItem {
  id: string;
  action_text: string;
  action_type: 'followup' | 'note' | 'status_change' | 'description_change' | 
               'assignment_change' | 'attachment_added' | 'attachment_removed' | 'task_created';
  // ... rest blijft hetzelfde
}
```

Update rendering van action items om dynamische iconen te tonen in plaats van vaste `CheckCircle2`.

### 2.2 TaskDetailModal - Reporter/Creator Info

**Bestand:** `src/components/TaskDetailModal.tsx`

Uitbreiden van de Task interface:
```typescript
interface Task {
  // ... bestaande velden
  reporter_id?: string | null;
  created_at?: string;
  reporter?: {
    name: string | null;
    email: string | null;
  } | null;
}
```

Toevoegen in "Basis informatie" sectie (na assignee info):
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

### 2.3 NotificationBell - Task Assigned Handling

**Bestand:** `src/components/notifications/NotificationBell.tsx`

Uitbreiden van `getNotificationIcon`:
```typescript
const getNotificationIcon = (type: string) => {
  switch (type) {
    case "diploma_upgrade": return "🎓";
    case "vog_verified": return "📜";
    case "subtask_assignment": return "📋";
    case "task_assigned": return "📌";  // NIEUW
    default: return "🔔";
  }
};
```

Uitbreiden van `handleNotificationClick`:
```typescript
// Handle task assignment - navigate to task list with task highlight
if (notification.notification_type === 'task_assigned' && taskId) {
  navigate(`/dashboard?tab=lijst&taskId=${taskId}`);
  return;
}
```

---

## Fase 3: Query Uitbreidingen

### TaskDetailModal of relevante queries

Waar taken worden opgehaald met reporter info:
```typescript
const { data: task } = await supabase
  .from('tasks')
  .select(`
    *,
    profiles:assignee_id(name, email),
    reporter:reporter_id(name, email),
    organization:org_id(name)
  `)
  .eq('id', taskId)
  .single();
```

---

## Bestanden die worden gewijzigd

| Bestand | Wijziging |
|---------|-----------|
| **Database** | Nieuwe migratie met constraints, kolom, triggers en indexes |
| `src/components/ActionTimeline.tsx` | Iconen per action_type, interface uitbreiding |
| `src/components/TaskDetailModal.tsx` | Reporter/creator info in basis informatie |
| `src/components/notifications/NotificationBell.tsx` | `task_assigned` notificatie handling |

---

## Verwacht Resultaat

Na implementatie:
- ✅ Toewijzing aan collega → notificatie + gelogd in actieverloop
- ✅ Beschrijving wijzigen → gelogd in actieverloop
- ✅ Bijlage toevoegen/verwijderen → gelogd in actieverloop
- ✅ Subtaak voltooien → consistent gelogd (via trigger)
- ✅ Reporter/creator zichtbaar in taakdetail
- ✅ Iconen per action type in actieverloop
- ✅ Nieuwe `task_assigned` notificatie klikbaar naar taak
