
# Plan: Kanban Pagina - Verwijder Toggle, Maak Team Overzicht

## Overzicht

Dit plan transformeert de Kanban pagina van een persoonlijk/team hybride naar een dedicated **Team Kanban Bord**. De "Mijn taken / Alle taken" toggle wordt verwijderd omdat de persoonlijke taakweergave nu in het Dashboard zit.

---

## Wijzigingen Overzicht

| # | Regel(s) | Actie | Beschrijving |
|---|----------|-------|--------------|
| 1 | 18 | VERWIJDER | `useGlobalTaskFilter` import |
| 2 | 12 | WIJZIG | Verwijder `User, Users` uit icons import |
| 3 | 90 | VERWIJDER | Hook destructuring |
| 4 | 164 | WIJZIG | Dependency array: `[user, showOnlyMyTasks]` → `[user]` |
| 5 | 267-270 | VERWIJDER | If-block die filtert op `assignee_id` |
| 6 | 771-776 | WIJZIG | Header titel en subtitle |
| 7 | 779-799 | VERWIJDER | Toggle UI block (21 regels) |

---

## Gedetailleerde Wijzigingen

### 1. Verwijder useGlobalTaskFilter Import (regel 18)

```typescript
// VERWIJDER:
import { useGlobalTaskFilter } from "@/hooks/useGlobalTaskFilter";
```

### 2. Wijzig Icons Import (regel 12)

```typescript
// VAN:
import { Plus, Loader2, AlertCircle, Search, ListTodo, Clock, CheckCircle2, User, Users, ArrowUp, ArrowDown, ArrowUpDown, Calendar, GripVertical } from "lucide-react";

// NAAR:
import { Plus, Loader2, AlertCircle, Search, ListTodo, Clock, CheckCircle2, ArrowUp, ArrowDown, ArrowUpDown, Calendar, GripVertical } from "lucide-react";
```

### 3. Verwijder Hook Destructuring (regel 90)

```typescript
// VERWIJDER:
const { showOnlyMyTasks, setShowOnlyMyTasks, userId: globalFilterUserId } = useGlobalTaskFilter();
```

### 4. Vereenvoudig Dependency Array (regel 164)

```typescript
// VAN:
}, [user, showOnlyMyTasks]);

// NAAR:
}, [user]);
```

### 5. Verwijder Query Filter (regels 267-270)

```typescript
// VERWIJDER:
// Filter by current user's tasks if toggle is on
if (showOnlyMyTasks && user) {
  query = query.eq("assignee_id", user.id);
}
```

### 6. Update Header (regels 771-776)

```typescript
// VAN:
<h1 className="text-xl font-medium text-foreground">
  {fullGreeting}
</h1>
<p className="text-sm text-muted-foreground mt-0.5">
  {activeTasks} actief • {blockedCount} blocked • {completedToday} vandaag afgerond
</p>

// NAAR:
<h1 className="text-xl font-medium text-foreground">
  Team Kanban Bord
</h1>
<p className="text-sm text-muted-foreground mt-0.5">
  Team overzicht • {activeTasks} actief • {blockedCount} in afwachting • {completedToday} vandaag afgerond
</p>
```

### 7. Verwijder Toggle UI (regels 778-800)

```typescript
// VERWIJDER VOLLEDIG (22 regels):
{/* Mijn taken / Alle taken toggle */}
<div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
  <Button 
    variant={showOnlyMyTasks ? "default" : "ghost"} 
    size="sm"
    onClick={() => setShowOnlyMyTasks(true)}
    className="gap-1.5"
  >
    <User className="h-4 w-4" />
    Mijn taken
  </Button>
  <Button 
    variant={!showOnlyMyTasks ? "default" : "ghost"} 
    size="sm"
    onClick={() => setShowOnlyMyTasks(false)}
    className="gap-1.5"
  >
    <Users className="h-4 w-4" />
    Alle taken
  </Button>
</div>
```

---

## Resultaat Na Implementatie

```text
┌─────────────────────────────────────────────────────────────────┐
│ KANBAN PAGINA - VOOR                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  "Goedemorgen, [naam]"                                          │
│  X actief • X blocked • X vandaag afgerond                      │
│                                                                  │
│  [Mijn taken] [Alle taken]  [Sorteer ▼] [↑]                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

                              ↓

┌─────────────────────────────────────────────────────────────────┐
│ KANBAN PAGINA - NA                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  "Team Kanban Bord"                                             │
│  Team overzicht • X actief • X in afwachting • X vandaag afgerond│
│                                                                  │
│  [Sorteer ▼] [↑]                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Niet Wijzigen

| Item | Reden |
|------|-------|
| `useGlobalTaskFilter.ts` | Wordt nog gebruikt in Lijst.tsx en Kalender.tsx |
| `useGreeting` hook call | Blijft in code (geen breaking change), maar output niet meer in header |
| KPI stats bar | Blijft - toont team statistieken |
| Sorteer controls | Blijft intact |
| Zoekfunctie | Blijft intact |
| Drag & drop | Blijft intact |
| Alle andere features | Blijven intact |

---

## Technische Details

### Bestand
- `src/pages/Kanban.tsx` - 1 bestand, ~30 regels wijzigen/verwijderen

### Impact
- Kanban laadt nu ALTIJD alle team taken
- Persoonlijke taakweergave blijft beschikbaar in Dashboard > Mijn Werk tab
- Duidelijke scheiding: Dashboard = persoonlijk, Kanban = team

---

## Acceptatie Criteria

**Functioneel:**
- /kanban toont ALLE team taken (niet gefilterd op gebruiker)
- Header toont "Team Kanban Bord"
- Subtitle toont "Team overzicht • X actief • X in afwachting • X vandaag afgerond"
- Toggle "Mijn taken / Alle taken" is VOLLEDIG VERWIJDERD
- KPI stats tonen team-brede cijfers
- Sorteer opties werken nog
- Zoekfunctie werkt nog
- Drag & drop werkt nog

**Technisch:**
- Geen TypeScript errors
- Geen console errors
- `useGlobalTaskFilter.ts` NIET verwijderd
