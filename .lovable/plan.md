

# Fix: Consistentie "Mijn taken / Alle taken" Toggle

## Huidige Status

| Tab | Gebruikt Filter Hook | Heeft Toggle UI | Gedrag |
|-----|---------------------|-----------------|--------|
| Lijst | ✅ Ja | ✅ Ja (net toegevoegd) | Correct |
| Kalender | ✅ Ja | ✅ Ja | Correct |
| **Opvolging** | ❌ Nee | ❌ Nee | **Inconsistent** |
| Mijn Werk | N.v.t. | N.v.t. | Altijd persoonlijk (OK) |

---

## Probleem

De **Opvolging** tab gebruikt `useTasksQuery` direct zonder de globale filter hook. Dit betekent:
- Opvolging toont **altijd alle taken** van het hele team
- Dit is inconsistent met Lijst en Kalender
- Als Leonie daar kijkt, ziet ze taken van anderen zonder toggle optie

---

## Oplossing

### Wijziging: EmbeddedOpvolgingView.tsx

Voeg dezelfde toggle toe als bij Lijst en Kalender:

1. **Import toevoegen**: `useGlobalTaskFilter` hook + `Users` icon
2. **Filter toepassen**: Tasks filteren op basis van `showOnlyMyTasks` state
3. **Toggle UI toevoegen**: Dezelfde button group als andere views

---

## Implementatie Details

### Stap 1: Imports toevoegen

```text
import { useGlobalTaskFilter } from "@/hooks/useGlobalTaskFilter";
import { User, Users } from "lucide-react"; // Users toevoegen
```

### Stap 2: Hook gebruiken

```text
const { showOnlyMyTasks, setShowOnlyMyTasks, userId } = useGlobalTaskFilter();
```

### Stap 3: Tasks filteren

Na het ophalen van tasks, filter op basis van de globale state:

```text
// Filter tasks based on global "Mijn taken" setting
const filteredTasks = showOnlyMyTasks && userId
  ? tasks.filter(t => t.assignee_id === userId)
  : tasks;
```

### Stap 4: Toggle UI toevoegen

In de header sectie (rond regel 214-222), voeg toggle toe:

```text
<div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
  <Button 
    variant={showOnlyMyTasks ? "default" : "ghost"} 
    size="sm"
    onClick={() => setShowOnlyMyTasks(true)}
    className="gap-1.5 h-8 px-3 text-sm"
  >
    <User className="h-3.5 w-3.5" />
    <span className="hidden sm:inline">Mijn taken</span>
  </Button>
  <Button 
    variant={!showOnlyMyTasks ? "default" : "ghost"} 
    size="sm"
    onClick={() => setShowOnlyMyTasks(false)}
    className="gap-1.5 h-8 px-3 text-sm"
  >
    <Users className="h-3.5 w-3.5" />
    <span className="hidden sm:inline">Alle taken</span>
  </Button>
</div>
```

### Stap 5: Alle referenties naar `tasks` vervangen door `filteredTasks`

Vervang in de berekeningen en rendering:
- `tasksWithNextAction`
- `overdueTasks`
- `upcomingTasks`
- `allFocusTasks`
- Tekst "X taken uit Y taken"

---

## Verwacht Resultaat

| Aspect | Vóór | Na |
|--------|------|-----|
| Opvolging filter | Altijd alle taken | Keuze mijn/alle |
| Consistentie tussen tabs | Nee | Ja |
| Globale filter sync | Nee | Ja (localStorage) |

---

## Volledig Consistent Na Deze Fix

| Tab | Toggle | Globale State | Status |
|-----|--------|---------------|--------|
| Mijn Werk | N.v.t. | N.v.t. | OK |
| Kalender | ✅ | ✅ | OK |
| Lijst | ✅ | ✅ | OK |
| Opvolging | ✅ | ✅ | **Wordt gefixed** |
| Team | N.v.t. | N.v.t. | OK (altijd team) |
| Recruitment | N.v.t. | N.v.t. | OK |

---

## Technische Samenvatting

- **Bestand**: `src/components/dashboard/EmbeddedOpvolgingView.tsx`
- **Wijzigingen**: 
  - Import `useGlobalTaskFilter` + `User`, `Users` icons
  - Filter tasks met globale state
  - Toggle UI in header
- **Risico**: Laag (dezelfde logica als andere views)
- **Test**: Toggle in Lijst → Naar Opvolging → Zelfde filter actief

