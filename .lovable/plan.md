
# Uitbreiding: Actie Toevoegen met Toewijzing

## Status: ✅ VOLTOOID

---

## Geïmplementeerde Wijzigingen

### 1. Nieuwe State Variabelen
```typescript
const [showAssignee, setShowAssignee] = useState(false);
const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);
const [actionDueDate, setActionDueDate] = useState<Date | null>(null);
const [isCreatingAction, setIsCreatingAction] = useState(false);
const [teamMembers, setTeamMembers] = useState<Array<{id: string; name: string; email: string}>>([]);
```

### 2. Team Members useEffect
- Haalt org_id op van de task
- Query user_organizations + profiles join
- Filtert huidige user uit de lijst
- Set teamMembers state

### 3. Nieuwe Imports
- Checkbox, Label, Textarea
- Calendar as CalendarComponent
- Popover, PopoverContent, PopoverTrigger
- CalendarIcon, Loader2

### 4. Uitgebreide UI voor "Actie Toevoegen"
| Component | Beschrijving |
|-----------|--------------|
| **Textarea** | "Wat moet er gebeuren?" - min-height 80px |
| **Checkbox** | "Toewijzen aan collega" - toggle voor extra opties |
| **Select** | Collega dropdown (alleen zichtbaar bij toewijzing) |
| **DatePicker** | Deadline picker met Popover/Calendar |
| **Buttons** | "Annuleren" en "Actie Toevoegen" |

### 5. handleAddAction Duale Logica
**ZONDER toewijzing:** Bestaande flow - task_action_history + tasks.next_action update
**MET toewijzing:** Insert in subtasks tabel → trigger stuurt automatisch notificatie

---

## Resultaat

- ✅ "Actie toevoegen" opent uitgebreide form met Textarea
- ✅ Checkbox "Toewijzen aan collega" toont extra opties
- ✅ Collega dropdown toont team members (niet huidige user)
- ✅ Deadline picker werkt correct
- ✅ ZONDER toewijzing → task_action_history (bestaande flow)
- ✅ MET toewijzing → subtasks tabel → notificatie naar collega
- ✅ Button disabled als tekst leeg of (toewijzing aan maar geen collega geselecteerd)

---

## Gewijzigde Bestanden

| Bestand | Wijziging |
|---------|-----------|
| `src/components/ActionTimeline.tsx` | Uitgebreide "Actie toevoegen" form met toewijzing logica |
