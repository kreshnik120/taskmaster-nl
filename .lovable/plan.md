

# Plan: Persoonlijke Kolom Titels voor "Mijn Werk" Flow

## Probleem

In de "Mijn Werk" tab kan elke medewerker de Kanban kolom titels **niet** aanpassen. De kolommen tonen de standaard titels (Start., Actie uitgezet, etc.) terwijl de team Kanban (/kanban) wél persoonlijke titels ondersteunt.

---

## Huidige Situatie

| View | Persoonlijke Titels | Database Tabel |
|------|---------------------|----------------|
| Team Kanban (/kanban) | ✅ Werkt | `user_column_preferences` |
| Mijn Werk Flow | ❌ Niet geïmplementeerd | - |

De `user_column_preferences` tabel bestaat al en bevat al data van gebruikers die titels hebben aangepast in de team Kanban.

---

## Oplossing

De bestaande `user_column_preferences` functionaliteit hergebruiken in `MyTasksFlowSection.tsx`.

### Wat Wordt Aangepast

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           MIJN WERK FLOW                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │ [✏️ Start.] │  │ [✏️ Opgepakt]│  │ [✏️ Wachten] │ <- Bewerkbaar!    │
│  │      1       │  │      0       │  │      2       │                   │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤                   │
│  │              │  │              │  │              │                   │
│  │   Taak 1     │  │              │  │   Taak 3     │                   │
│  │              │  │              │  │              │                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Gedrag

1. **Hover** over kolom titel toont potloodje (✏️)
2. **Klik** op titel opent inline input veld
3. **Enter** slaat de nieuwe naam op naar `user_column_preferences`
4. **Escape** annuleert wijziging
5. Opgeslagen namen zijn **per gebruiker** - andere teamleden zien hun eigen titels

---

## Technische Implementatie

### Stap 1: Column Interface Uitbreiden

Voeg `originalName` toe aan de Column interface (regel 96-101):

```text
interface Column {
  id: string;
  name: string;          // Persoonlijke naam (of default)
  originalName: string;  // Standaard naam voor terugval
  status: string;
  order: number;
}
```

### Stap 2: User Preferences Laden in loadData()

Pas `loadData()` aan om persoonlijke voorkeuren te mergen (regel 229-267):

```text
// Laad persoonlijke kolom voorkeuren
const { data: prefsData } = await supabase
  .from("user_column_preferences")
  .select("column_id, custom_name")
  .eq("user_id", user.id);

const prefsMap = new Map(
  (prefsData || []).map(p => [p.column_id, p.custom_name])
);

// Merge kolommen met persoonlijke voorkeuren
const mergedColumns = (columnsData || []).map(col => ({
  ...col,
  originalName: col.name,
  name: prefsMap.get(col.id) || col.name,
}));

setColumns(mergedColumns);
```

### Stap 3: Update Functie Toevoegen

Nieuwe functie `handleUpdateColumnName`:

```text
const handleUpdateColumnName = async (columnId: string, newName: string) => {
  if (!user) return;
  
  try {
    const { error } = await supabase
      .from("user_column_preferences")
      .upsert({
        user_id: user.id,
        column_id: columnId,
        custom_name: newName,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,column_id'
      });

    if (error) throw error;

    // Optimistic update
    setColumns(prev => prev.map(col =>
      col.id === columnId ? { ...col, name: newName } : col
    ));

    toast.success("Kolomnaam opgeslagen");
  } catch (error) {
    console.error("Error updating column name:", error);
    toast.error("Fout bij opslaan kolomnaam");
  }
};
```

### Stap 4: Bewerkbare Kolom Header UI

Pas de CardTitle aan (regel 707-712) om inline editing te ondersteunen:

```text
// Voeg state toe per kolom
const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
const [editingName, setEditingName] = useState("");

// In de render loop:
<CardTitle className="text-sm font-medium flex items-center justify-between group">
  {editingColumnId === column.id ? (
    <Input
      value={editingName}
      onChange={(e) => setEditingName(e.target.value)}
      onBlur={() => {
        if (editingName.trim() && editingName !== column.name) {
          handleUpdateColumnName(column.id, editingName.trim());
        }
        setEditingColumnId(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          if (editingName.trim() && editingName !== column.name) {
            handleUpdateColumnName(column.id, editingName.trim());
          }
          setEditingColumnId(null);
        }
        if (e.key === 'Escape') {
          setEditingColumnId(null);
        }
      }}
      className="h-6 text-sm py-0"
      autoFocus
      maxLength={50}
    />
  ) : (
    <span 
      className="truncate cursor-pointer hover:text-foreground/80 flex items-center gap-1.5"
      onClick={() => {
        setEditingColumnId(column.id);
        setEditingName(column.name);
      }}
    >
      {column.name}
      <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </span>
  )}
  <Badge variant="glass" className="ml-2 text-xs">
    {total}
  </Badge>
</CardTitle>
```

---

## Geen Breaking Changes

| Bestaande Functionaliteit | Impact |
|---------------------------|--------|
| Team Kanban voorkeuren | ✅ Dezelfde tabel, sync automatisch |
| Drag-and-drop | ✅ Ongewijzigd |
| Realtime updates | ✅ Ongewijzigd |
| Sortering en zoeken | ✅ Ongewijzigd |
| Keyboard shortcuts | ✅ Ongewijzigd |

---

## Voordelen

1. **Consistentie**: Dezelfde voorkeuren werken nu in zowel Mijn Werk als Team Kanban
2. **Geen migratie**: Bestaande voorkeuren uit team Kanban zijn direct zichtbaar
3. **Per gebruiker**: Elke medewerker ziet zijn eigen titels
4. **Eenvoudig**: Klik op titel om te bewerken

---

## Bestanden

| Bestand | Wijziging |
|---------|-----------|
| `src/components/dashboard/MyTasksFlowSection.tsx` | Column interface, loadData(), handleUpdateColumnName(), CardTitle UI |

---

## Database

Geen wijzigingen nodig - de `user_column_preferences` tabel bestaat al en heeft de juiste structuur:
- `user_id` (UUID)
- `column_id` (UUID)
- `custom_name` (text)
- `is_collapsed` (boolean)

