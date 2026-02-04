# Plan: Fix Race Condition in EmbeddedListView.tsx

## Status: ✅ VOLTOOID

---

## Probleem (Opgelost)

De takenlijst toonde inconsistente resultaten na het toevoegen van acties doordat:
1. `fetchTasks()` werd aangeroepen voordat `globalFilterUserId` was geladen
2. Twee verschillende userId bronnen werden gebruikt (`currentUserId` + `globalFilterUserId`)

---

## Doorgevoerde Wijzigingen

### Bestand: `src/components/dashboard/EmbeddedListView.tsx`

| Wijziging | Status |
|-----------|--------|
| `loading: filterLoading` toegevoegd aan hook destructuring | ✅ |
| `currentUserId` state verwijderd | ✅ |
| `useMySubtasks` hook geüpdatet naar `globalFilterUserId` | ✅ |
| `useEffect` wacht nu op `globalFilterUserId` | ✅ |
| `initUser` functie verwijderd | ✅ |
| Alle `currentUserId` verwijzingen vervangen (~12) | ✅ |
| Loading guard gecombineerd met `filterLoading` | ✅ |

---

## Samenvatting

| Actie | Aantal |
|-------|--------|
| State variabelen verwijderd | 1 |
| Functies verwijderd | 1 |
| useEffect dependencies gefixed | 1 |
| Variable verwijzingen vervangen | ~12 |
| Loading guard toegevoegd | 1 |

---

## Verwacht Resultaat

Na deze fix:
- Taken laden pas wanneer userId beschikbaar is
- Na actie toevoegen blijft dezelfde takenlijst zichtbaar
- Geen race condition meer tussen userId loading en fetchTasks()
