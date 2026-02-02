
# Plan: Nieuwe Taak Knop toevoegen aan Dashboard "Mijn Taken"

## Probleem

Personeel kan geen nieuwe taak aanmaken in de "Mijn Taken" sectie op het Dashboard. De knop ontbreekt volledig in de `MyTasksFlowSection` component.

### Huidige Situatie

| Locatie | Nieuwe Taak Knop |
|---------|------------------|
| Dashboard - Mijn Taken | Ontbreekt |
| Lijstweergave (/lijst) | Aanwezig |
| Team Kanban (/kanban) | Aanwezig |

## Oplossing

Voeg een "Nieuwe taak" knop toe aan de header van de "Mijn Taken" sectie, die de bestaande `TaskDialog` component opent.

### Wijzigingen

**Bestand**: `src/components/dashboard/MyTasksFlowSection.tsx`

1. **Import TaskDialog component** (bestaat al in het project)
2. **Voeg state toe** voor dialog open/close
3. **Voeg "+" knop toe** in de controls row naast "Team overzicht"
4. **Render TaskDialog** met:
   - Automatisch toewijzen aan huidige gebruiker
   - Column standaard op "BACKLOG"
   - onSuccess callback om data te herladen

### Visueel Ontwerp

De nieuwe knop komt rechts naast de "Team overzicht" link:

```
[Deadline ▼] [↑] [🔍 Zoek taken... (/)]  [+ Nieuwe taak] [Team overzicht →]
```

### Gebruikerservaring

- Klik op "+ Nieuwe taak" opent het 2-stappen formulier
- Taak wordt automatisch aan de ingelogde gebruiker toegewezen
- Na opslaan verschijnt de taak direct in de "Start" (Backlog) kolom
- Keyboard shortcut: 'n' toets opent ook de dialog (consistent met Lijstweergave)

---

## Technische Details

### Benodigde Code Wijzigingen

```typescript
// 1. Import toevoegen
import { TaskDialog } from "@/components/TaskDialog";

// 2. State toevoegen in component
const [taskDialogOpen, setTaskDialogOpen] = useState(false);

// 3. Knop toevoegen in controls row
<Button onClick={() => setTaskDialogOpen(true)} size="sm" className="gap-2">
  <Plus className="h-4 w-4" />
  Nieuwe taak
</Button>

// 4. Dialog renderen
<TaskDialog
  open={taskDialogOpen}
  onOpenChange={setTaskDialogOpen}
  onSuccess={loadData}
/>
```

### Keyboard Shortcut

De bestaande keyboard listener uitbreiden:

```typescript
// In useEffect voor keyboard shortcuts
if (e.key === 'n' && !detailModalOpen && !taskDialogOpen) {
  e.preventDefault();
  setTaskDialogOpen(true);
}
```

### Geen Database Wijzigingen Nodig

De `TaskDialog` component is volledig functioneel en gebruikt de bestaande `tasks` tabel met correcte RLS policies.

---

## Verwacht Resultaat

Na implementatie:

- Personeel kan direct vanuit "Mijn Taken" nieuwe taken aanmaken
- Taken worden automatisch aan henzelf toegewezen
- Consistente UX met de Lijstweergave en Team Kanban
- Sneltoets 'n' werkt ook in het Dashboard
