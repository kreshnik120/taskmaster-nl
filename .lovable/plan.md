

# Fix: Logische Sortering bij Groepering op Datum

## Probleem Analyse

Wanneer gebruikers (zoals Leonie) groeperen op "Startdatum", toont de huidige implementatie de groepen in **willekeurige volgorde** in plaats van chronologisch. Dit komt door:

1. **Object keys zijn niet gesorteerd** - `Object.entries()` retourneert entries in invoegvolgorde
2. **Geen datum-gebaseerde sortering** - De groep-sleutels zijn strings (bijv. "START: 25-01-26") die niet correct sorteren
3. **"Ongegroepeerd" positie** - Taken zonder datum verschijnen op een willekeurige plek

---

## Huidige Code (Probleem)

```javascript
const groupedTasks = () => {
  const groups: Record<string, Task[]> = {};
  filteredTasks.forEach((task) => {
    let key = "Ongegroepeerd";
    if (groupBy === "start" && task.start_at) {
      key = `START: ${format(...)}`;  // String-gebaseerde key
    }
    // ... geen sortering
  });
  return groups;  // Ongesorteerd object
};
```

---

## Oplossing

### Strategie

1. **Bewaar originele datums** - Gebruik een Map of array met zowel de sorteersleutel (timestamp) als de display-sleutel
2. **Sorteer groepen chronologisch** - Oudste datum eerst (ascending)
3. **Sorteer taken binnen groepen** - Ook op datum binnen elke groep
4. **"Ongegroepeerd" altijd laatst** - Taken zonder datum komen aan het einde

---

## Implementatie

### Wijziging: `groupedTasks()` Functie Verbeteren

**Bestand**: `src/components/dashboard/EmbeddedListView.tsx`

**Nieuwe logica**:

```text
const groupedTasks = () => {
  if (groupBy === "none") return { "Alle taken": filteredTasks };

  // Interface voor groepen met sorteerbare datum
  interface GroupData {
    displayKey: string;
    sortKey: number; // timestamp voor sortering
    tasks: Task[];
  }

  const groupsMap: Map<string, GroupData> = new Map();

  filteredTasks.forEach((task) => {
    let displayKey = "Ongegroepeerd";
    let sortKey = Number.MAX_SAFE_INTEGER; // Ongegroepeerd komt laatst

    if (groupBy === "start" && task.start_at) {
      const date = new Date(task.start_at);
      displayKey = `START: ${format(date, "dd-MM-yy", { locale: nl })}`;
      sortKey = date.getTime();
    } else if (groupBy === "due" && task.due_at) {
      const date = new Date(task.due_at);
      displayKey = `EIND: ${format(date, "dd-MM-yy", { locale: nl })}`;
      sortKey = date.getTime();
    } else if (groupBy === "priority") {
      // Prioriteit sortering: CRITICAL=0, HIGH=1, MEDIUM=2, LOW=3
      const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      displayKey = getPriorityLabel(task.priority);
      sortKey = priorityOrder[task.priority] ?? 4;
    }

    const existing = groupsMap.get(displayKey);
    if (existing) {
      existing.tasks.push(task);
    } else {
      groupsMap.set(displayKey, { displayKey, sortKey, tasks: [task] });
    }
  });

  // Sorteer groepen: oplopend (oudste eerst), "Ongegroepeerd" laatst
  const sortedGroups = Array.from(groupsMap.values()).sort((a, b) => a.sortKey - b.sortKey);

  // Sorteer taken BINNEN elke groep ook op datum (indien datum-groepering)
  if (groupBy === "start" || groupBy === "due") {
    const dateField = groupBy === "start" ? "start_at" : "due_at";
    sortedGroups.forEach(group => {
      group.tasks.sort((a, b) => {
        const dateA = a[dateField] ? new Date(a[dateField]).getTime() : Number.MAX_SAFE_INTEGER;
        const dateB = b[dateField] ? new Date(b[dateField]).getTime() : Number.MAX_SAFE_INTEGER;
        return dateA - dateB;
      });
    });
  }

  // Converteer terug naar Record voor bestaande rendering
  const result: Record<string, Task[]> = {};
  sortedGroups.forEach(group => {
    result[group.displayKey] = group.tasks;
  });

  return result;
};
```

---

## Verwachte Resultaat

### Vóór (Willekeurig)

```text
START: 02-02-26
  └── Taak 123
START: 25-01-26
  └── Taak 59
START: 26-01-26
  └── Taak 88
Ongegroepeerd
  └── Taak 124, 125
```

### Na (Chronologisch)

```text
START: 25-01-26     ← Oudste eerst
  └── Taak 59
START: 26-01-26
  └── Taak 88
START: 02-02-26
  └── Taak 123
Ongegroepeerd       ← Altijd laatst
  └── Taak 124, 125
```

---

## Sorteervolgorde per Groepeertype

| Groepeer op | Sorteervolgorde |
|-------------|-----------------|
| Startdatum | Oudste datum eerst (ascending) |
| Einddatum | Oudste datum eerst (ascending) |
| Prioriteit | CRITICAL → HIGH → MEDIUM → LOW |
| Geen | Standaard volgorde (sequence_number) |

---

## Taken Binnen Groepen

Ook de taken **binnen** elke groep worden gesorteerd:
- Bij datum-groepering: op de relevante datum (start_at of due_at)
- Bij prioriteit-groepering: bestaande sortering behouden

---

## Technische Samenvatting

| Aspect | Details |
|--------|---------|
| **Bestand** | `src/components/dashboard/EmbeddedListView.tsx` |
| **Functie** | `groupedTasks()` (regels 533-553) |
| **Wijziging** | Chronologische sortering + taken binnen groepen sorteren |
| **Risico** | Laag - alleen sorteerlogica wijzigt, geen data-wijzigingen |
| **Test** | Groepeer op Startdatum → Controleer 25-01 < 26-01 < 02-02 |

