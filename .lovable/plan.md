
# Uitbreiding: Actie Toevoegen met Toewijzing

## Overzicht

Deze uitbreiding transformeert de simpele "Actie toevoegen" Input naar een uitgebreidere form met:
- Textarea voor actie beschrijving
- Optionele toewijzing aan collega
- Deadline picker
- Duale flow: task_action_history (solo) of subtasks (delegatie)

---

## Wijzigingen in ActionTimeline.tsx

### 1. Nieuwe State Variabelen (na regel 135)

Toevoegen:
```typescript
const [showAssignee, setShowAssignee] = useState(false);
const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);
const [actionDueDate, setActionDueDate] = useState<Date | null>(null);
const [isCreatingAction, setIsCreatingAction] = useState(false);
const [teamMembers, setTeamMembers] = useState<Array<{id: string; name: string; email: string}>>([]);
```

### 2. Team Members Laden via useEffect (na regel 193)

Nieuwe useEffect die teamleden ophaalt:
- Query task.org_id
- Query user_organizations + profiles join
- Filter huidige user uit de lijst
- Set teamMembers state

### 3. Nieuwe Imports (regel 1-29)

Toevoegen aan imports:
```typescript
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2 } from "lucide-react";
```

### 4. UI Vervanging voor "Actie Toevoegen" Sectie (regel 1231-1270)

Vervang de huidige simpele Input+Button met een uitgebreidere form:

| Component | Beschrijving |
|-----------|--------------|
| **Textarea** | "Wat moet er gebeuren?" - min-height 80px |
| **Checkbox** | "Toewijzen aan collega" - toggle voor extra opties |
| **Select** | Collega dropdown (alleen zichtbaar bij toewijzing) |
| **DatePicker** | Deadline picker met Popover/Calendar |
| **Buttons** | "Annuleren" en "Actie Toevoegen" |

De form heeft een nette visuele indeling met een linker border-l voor toewijzing opties.

### 5. handleAddAction Functie Uitbreiden (regel 355-418)

Duale logica toevoegen:

**Als ZONDER toewijzing (showAssignee = false of geen selectedAssignee):**
- Bestaande flow behouden
- Insert/update in task_action_history
- Update tasks.next_action

**Als MET toewijzing:**
- Query hoogste subtask.order voor deze task
- Insert in subtasks tabel met:
  - `task_id`, `title` (actie tekst), `status: 'active'`
  - `order: nextOrder`, `assignee_id`, `due_at`
- Trigger `notify_subtask_assignment` stuurt automatisch notificatie

### 6. Reset Functie Uitbreiden

Bij annuleren of succes, reset alle nieuwe state:
```typescript
setShowAssignee(false);
setSelectedAssignee(null);
setActionDueDate(null);
```

---

## Flow Diagram

```text
┌─────────────────────────────┐
│   Gebruiker klikt "Actie"   │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│   Textarea: actie tekst     │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ ☐ Toewijzen aan collega?    │
└─────────────┬───────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
    ▼                   ▼
┌───────────┐     ┌─────────────────┐
│ NIET AAN  │     │     AAN         │
└─────┬─────┘     │                 │
      │           │  ┌────────────┐ │
      │           │  │ Collega    │ │
      │           │  │ Dropdown   │ │
      │           │  └────────────┘ │
      │           │                 │
      │           │  ┌────────────┐ │
      │           │  │ Deadline   │ │
      │           │  │ Picker     │ │
      │           │  └────────────┘ │
      │           └────────┬────────┘
      │                    │
      ▼                    ▼
┌───────────────┐   ┌────────────────┐
│ task_action   │   │   subtasks     │
│   _history    │   │   tabel        │
│               │   │                │
│ next_action   │   │ → Notificatie  │
│   update      │   │   naar collega │
└───────────────┘   └────────────────┘
```

---

## Verwacht Resultaat

- ✅ "Actie toevoegen" opent uitgebreide form met Textarea
- ✅ Checkbox "Toewijzen aan collega" toont extra opties
- ✅ Collega dropdown toont team members (niet huidige user)
- ✅ Deadline picker werkt correct
- ✅ ZONDER toewijzing → task_action_history (bestaande flow)
- ✅ MET toewijzing → subtasks tabel → notificatie naar collega
- ✅ Button disabled als tekst leeg of (toewijzing aan maar geen collega geselecteerd)

---

## Bestanden die worden gewijzigd

| Bestand | Wijziging |
|---------|-----------|
| `src/components/ActionTimeline.tsx` | Uitgebreide "Actie toevoegen" form met toewijzing logica |
