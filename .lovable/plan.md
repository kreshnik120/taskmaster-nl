

# Analyse: Impact van Auto-Assign & Acceptatie Workflow

## Samenvatting Bevindingen

Na uitgebreid onderzoek van de codebase blijkt dat de voorgestelde wijzigingen **VEILIG** zijn, maar er zijn enkele belangrijke technische overwegingen.

---

## Huidige Database Status

| Tabel | accepted_at | accepted_by | created_by |
|-------|-------------|-------------|------------|
| `tasks` | ✅ Bestaat | ✅ Bestaat | ❌ Ontbreekt |
| `subtasks` | ❌ Ontbreekt | ❌ Ontbreekt | ❌ Ontbreekt |

**Conclusie**: De `tasks` tabel heeft al de benodigde kolommen, maar subtasks mist deze nog.

---

## Bestaande Acceptatie-Logica (Lijst.tsx)

De Lijst-view heeft al werkende acceptatie-logica:

```typescript
// handleAcceptTask (regel 333-354)
const handleAcceptTask = async (taskId: string) => {
  await supabase.from("tasks").update({ 
    accepted_by: currentUserId,
    accepted_at: new Date().toISOString(),
    assignee_id: currentUserId
  }).eq("id", taskId);
};

// handleUpdateAssignee (regel 356-386)
// Auto-accept bij self-assignment
if (assigneeId === currentUserId) {
  updates.accepted_by = currentUserId;
  updates.accepted_at = new Date().toISOString();
}
```

**Status**: Dit werkt correct en hoeft NIET gewijzigd te worden.

---

## Probleem in TaskDialog.tsx

De `TaskDialog` component (regel 233-243) zet **GEEN** acceptatie-velden bij nieuwe taken:

```typescript
const taskData = {
  title: values.title,
  // ... andere velden
  assignee_id: values.assignee_id,
  // ONTBREEKT: accepted_at, accepted_by
};
```

**Impact**: 
- Nieuwe taken aangemaakt via "Mijn Taken" worden WEL toegewezen aan de gebruiker
- Maar ze zijn NIET geaccepteerd (accepted_at = null)
- Dit veroorzaakt inconsistentie met de Lijst-view logica

---

## Risico Analyse

### Wat kan BREKEN?

| Scenario | Risico | Toelichting |
|----------|--------|-------------|
| Lijst.tsx acceptatie | ❌ Geen | Blijft ongewijzigd |
| Bulk assign | ❌ Geen | Blijft ongewijzigd |
| TaskDetailModal | ⚠️ Laag | Toont taak maar geen acceptatie UI |
| MyTasksFlowSection | ⚠️ Medium | Toont taken die auto-assigned maar niet geaccepteerd zijn |
| Subtask delegatie | ⚠️ Medium | Database-migratie nodig |

### Wat werkt al correct?

- `Lijst.tsx`: handleAcceptTask, handleUpdateAssignee
- Bulk assign met auto-reset van accepted_by/accepted_at
- UI voor "Accepteren" knop in Lijst-view

---

## Minimale Fix (Aanbevolen)

In plaats van de complexe workflow uit het eerdere plan, stel ik een **minimale, niet-breaking fix** voor:

### Stap 1: TaskDialog.tsx aanpassen

Voeg auto-assign EN auto-accept toe bij nieuwe taken:

```typescript
// Haal current user op
const { data: { user } } = await supabase.auth.getUser();

const taskData = {
  ...bestaandeVelden,
  assignee_id: user?.id,           // AUTO-ASSIGN
  accepted_by: user?.id,           // AUTO-ACCEPT  
  accepted_at: new Date().toISOString(),
};
```

**Impact**: 
- Nieuwe taken zijn direct geaccepteerd
- Verschijnen correct in "Mijn Taken"
- Geen breaking changes

### Stap 2: Subtasks migratie (OPTIONEEL)

De subtasks tabel heeft nog GEEN acceptatie-kolommen. Dit kan later toegevoegd worden zonder breaking changes:

```sql
ALTER TABLE public.subtasks 
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
```

**Dit hoeft NIET nu** - het huidige systeem werkt correct zonder.

---

## Wijzigingen per Bestand

| Bestand | Wijziging | Breaking? |
|---------|-----------|-----------|
| `TaskDialog.tsx` | Auto-assign + auto-accept bij nieuwe taak | ❌ Nee |
| `Lijst.tsx` | Geen wijziging nodig | N/A |
| `MyTasksFlowSection.tsx` | Geen wijziging nodig | N/A |
| `SubtaskManager.tsx` | Geen wijziging nodig (later uit te breiden) | N/A |
| Database migratie | Subtasks kolommen (optioneel, later) | ❌ Nee |

---

## Implementatie Detail

### TaskDialog.tsx - Wijziging

**Huidige code (regel 205-256):**
```typescript
const onSubmit = async (values: TaskFormData) => {
  // ...
  const taskData = {
    title: values.title,
    description: values.description || null,
    priority: values.priority,
    assignee_id: values.assignee_id && values.assignee_id !== "unassigned" ? values.assignee_id : null,
    start_at: startAtISO,
    due_at: dueAtISO,
    next_action: values.next_action || null,
    org_id: defaultOrgId,
    column_id: columnId || defaultBacklogColumnId,
  };
  
  if (taskId) {
    // Update existing task
  } else {
    // Create new task - PROBLEEM: geen auto-accept
    const { data, error } = await supabase.from("tasks").insert(taskData).select('id').single();
  }
};
```

**Nieuwe code:**
```typescript
const onSubmit = async (values: TaskFormData) => {
  // Haal huidige user op
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  
  // Bepaal assignee en acceptatie
  const assigneeId = values.assignee_id && values.assignee_id !== "unassigned" 
    ? values.assignee_id 
    : currentUser?.id || null; // DEFAULT naar huidige user
  
  // Auto-accept als aan jezelf toegewezen
  const isAutoAccept = assigneeId === currentUser?.id;
  
  const taskData = {
    title: values.title,
    description: values.description || null,
    priority: values.priority,
    assignee_id: assigneeId,
    start_at: startAtISO,
    due_at: dueAtISO,
    next_action: values.next_action || null,
    org_id: defaultOrgId,
    column_id: columnId || defaultBacklogColumnId,
    // AUTO-ACCEPT logica
    accepted_by: isAutoAccept ? currentUser?.id : null,
    accepted_at: isAutoAccept ? new Date().toISOString() : null,
  };
  
  // Rest blijft hetzelfde...
};
```

---

## Visuele Flow (Na Implementatie)

```text
SCENARIO 1: Nieuwe taak in "Mijn Taken"
┌─────────────────────────────────────────┐
│  Klik "+ Nieuwe taak"                   │
│          ↓                              │
│  TaskDialog opent                       │
│          ↓                              │
│  Gebruiker vult formulier in            │
│          ↓                              │
│  Opslaan                                │
│          ↓                              │
│  ┌─────────────────────────────────┐    │
│  │ assignee_id = huidige user      │    │
│  │ accepted_by = huidige user      │    │
│  │ accepted_at = NOW()             │    │
│  └─────────────────────────────────┘    │
│          ↓                              │
│  Taak verschijnt in "Mijn Taken" ✅     │
└─────────────────────────────────────────┘

SCENARIO 2: Taak delegeren via Lijst
┌─────────────────────────────────────────┐
│  Wijzig assignee naar collega           │
│          ↓                              │
│  handleUpdateAssignee() activeert       │
│          ↓                              │
│  ┌─────────────────────────────────┐    │
│  │ assignee_id = collega           │    │
│  │ accepted_by = NULL (reset)      │    │
│  │ accepted_at = NULL (reset)      │    │
│  └─────────────────────────────────┘    │
│          ↓                              │
│  Collega ziet [Accepteren] knop         │
│  (bestaande Lijst.tsx logica) ✅        │
└─────────────────────────────────────────┘
```

---

## Conclusie

De **minimale fix** is:

1. **TaskDialog.tsx**: Auto-assign aan huidige user + auto-accept
2. **Geen andere bestanden wijzigen**
3. **Geen database migratie nodig** (subtasks later)

Dit zorgt ervoor dat:
- Nieuwe taken direct zichtbaar zijn in "Mijn Taken"
- Bestaande delegatie-flow in Lijst.tsx blijft werken
- Geen breaking changes in andere componenten

