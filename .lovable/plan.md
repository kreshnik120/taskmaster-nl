

# Verfijnd Plan: Filter op Medewerker Toevoegen

## ✅ Verificatie Huidige Structuur

Na grondige analyse is bevestigd dat het plan **naadloos aansluit** op de bestaande code:

| Aspect | Huidige Status | Compatibiliteit |
|--------|----------------|-----------------|
| `profiles` state (regel 102) | ✅ Beschikbaar | Kan hergebruikt worden |
| `loadProfiles()` functie (regel 147-159) | ✅ Laadt alle profielen | Perfecte databron |
| Filter state pattern | `filterPriority`, `filterStatus` als strings | Zelfde pattern volgen |
| Filter UI locatie (regel 708-760) | 3 kolommen in flex container | Voeg 4e kolom toe |
| `filteredTasks` useMemo (regel 491-532) | Filter op priority, status, search | Voeg assignee filter toe |
| "Mijn taken" toggle (regel 660-680) | Database-niveau filtering | Werkt onafhankelijk |

---

## Implementatie Details

### Stap 1: Nieuwe State Toevoegen

**Locatie**: Rond regel 98 (bij andere filter states)

```text
const [filterAssignee, setFilterAssignee] = useState<string>("all");
```

---

### Stap 2: Filter UI Toevoegen

**Locatie**: Na de status filter (regel 759-760)

Een vierde `<div className="flex-1">` toevoegen:

```text
<div className="flex-1">
  <label className="text-sm font-medium mb-2 block">
    Filter op medewerker
  </label>
  <Select value={filterAssignee} onValueChange={setFilterAssignee}>
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent className="bg-popover z-50">
      <SelectItem value="all">Alle medewerkers</SelectItem>
      <SelectItem value="unassigned">Niet toegewezen</SelectItem>
      {profiles.map((profile) => (
        <SelectItem key={profile.id} value={profile.id}>
          {profile.name || 'Onbekend'}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

**Let op**: `bg-popover z-50` toegevoegd voor correcte dropdown weergave (conform useful-context richtlijnen).

---

### Stap 3: Filter Logica Toevoegen

**Locatie**: In `filteredTasks` useMemo (regel 492-506)

Voeg toe **na** de huidige filter checks (rond regel 505):

```text
// Filter op medewerker (alleen actief bij "Alle taken" mode)
if (!showOnlyMyTasks && filterAssignee !== "all") {
  if (filterAssignee === "unassigned") {
    if (task.assignee_id) return false;
  } else {
    if (task.assignee_id !== filterAssignee) return false;
  }
}
```

---

### Stap 4: useMemo Dependencies Bijwerken

**Locatie**: Regel 532

Voeg `filterAssignee` en `showOnlyMyTasks` toe aan de dependency array:

```text
}, [tasks, filterPriority, filterStatus, filterAssignee, showOnlyMyTasks, sortColumn, sortDirection, debouncedSearchQuery]);
```

---

## Gedrag Matrix

| "Mijn taken" Toggle | Medewerker Filter | Resultaat |
|---------------------|-------------------|-----------|
| Mijn taken (actief) | Elke waarde | Alleen jouw taken (toggle wint, filter genegeerd) |
| Alle taken | Alle medewerkers | Alle taken van het team |
| Alle taken | "Jan" | Alleen Jan's taken |
| Alle taken | Niet toegewezen | Taken zonder assignee |

---

## Visuele Layout (Na Implementatie)

```text
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              [Mijn taken] [Alle taken]                              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [🔍 Zoek taken... (Cmd+K)                                                       ]   │
├────────────────┬────────────────┬────────────────┬────────────────┬─────────────────┤
│ Groepeer op    │ Filter priorit.│ Filter status  │ Filter medewerk.                │
│ [Startdatum ▼] │ [Alle prior. ▼]│ [Alle stat. ▼] │ [Alle medewerk.▼]               │
└────────────────┴────────────────┴────────────────┴──────────────────────────────────┘
```

---

## Geen Breaking Changes

| Bestaande Functionaliteit | Impact |
|---------------------------|--------|
| Groepering (datum/prioriteit) | ✅ Ongewijzigd |
| Priority filter | ✅ Ongewijzigd |
| Status filter | ✅ Ongewijzigd |
| Zoekfunctie | ✅ Ongewijzigd |
| "Mijn taken" toggle | ✅ Ongewijzigd, neemt voorrang |
| Kolom sortering | ✅ Ongewijzigd |
| Bulk acties | ✅ Ongewijzigd |
| KPI kaarten | ✅ Ongewijzigd |

---

## Technische Samenvatting

| Item | Details |
|------|---------|
| **Bestand** | `src/components/dashboard/EmbeddedListView.tsx` |
| **Nieuwe state** | `filterAssignee: string` (default "all") |
| **UI locatie** | Regel 760 (na status filter) |
| **Filter logica** | Regel 505 (in filteredTasks useMemo) |
| **Databron** | Bestaande `profiles` state |
| **Risico** | Laag - alleen additieve wijzigingen |

---

## Test Scenario's

1. **Met "Mijn taken" actief**: Medewerker filter wordt genegeerd → Alleen eigen taken zichtbaar
2. **Met "Alle taken" + "Jan"**: Alleen Jan's taken verschijnen
3. **Met "Alle taken" + "Niet toegewezen"**: Alleen taken zonder assignee
4. **Combinatie met prioriteit filter**: Beide filters werken samen (AND logica)
5. **Combinatie met groepering**: Groepen bevatten alleen gefilterde taken

