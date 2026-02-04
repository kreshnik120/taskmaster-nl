

# Plan: Fix Race Condition in EmbeddedListView.tsx

## Probleem

De takenlijst toont inconsistente resultaten na het toevoegen van acties doordat:
1. `fetchTasks()` wordt aangeroepen voordat `globalFilterUserId` is geladen
2. Twee verschillende userId bronnen worden gebruikt (`currentUserId` + `globalFilterUserId`)

---

## Wijzigingen

### Bestand: `src/components/dashboard/EmbeddedListView.tsx`

**Wijziging 1: Voeg `loading` toe aan hook destructuring (regel ~103)**

```typescript
// Was:
const { showOnlyMyTasks, setShowOnlyMyTasks, userId: globalFilterUserId } = useGlobalTaskFilter();

// Wordt:
const { showOnlyMyTasks, setShowOnlyMyTasks, userId: globalFilterUserId, loading: filterLoading } = useGlobalTaskFilter();
```

**Wijziging 2: Verwijder `currentUserId` state (regel ~105)**

```typescript
// Verwijderen:
const [currentUserId, setCurrentUserId] = useState<string | null>(null);
```

**Wijziging 3: Update `useMySubtasks` hook (regel ~126)**

```typescript
// Was:
const { subtasks: mySubtasks } = useMySubtasks(currentUserId);

// Wordt:
const { subtasks: mySubtasks } = useMySubtasks(globalFilterUserId);
```

**Wijziging 4: Fix useEffect - wacht op userId (regel ~136-146)**

```typescript
// Was:
useEffect(() => {
  initUser();
  fetchTasks();
  loadProfiles();
}, []);

const initUser = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    setCurrentUserId(session.user.id);
  }
};

// Wordt:
useEffect(() => {
  if (globalFilterUserId) {
    fetchTasks();
    loadProfiles();
  }
}, [globalFilterUserId]);

// initUser functie volledig verwijderen
```

**Wijziging 5: Vervang alle `currentUserId` verwijzingen door `globalFilterUserId`**

Locaties:
- Regel ~292: `if (!currentUserId) return;`
- Regel ~299-300: `accepted_by` en `assignee_id`
- Regel ~323-325: assignee check
- Regel ~369, 376: delete functie
- Regel ~414: restore functie
- Regel ~563: subtask filter

**Wijziging 6: Combineer loading states (regel ~598)**

```typescript
// Was:
if (loading) {

// Wordt:
if (loading || filterLoading) {
```

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

