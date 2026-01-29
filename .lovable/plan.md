
# Filter- en Sorteerfunctionaliteit voor MyTasksFlowSection

## Overzicht

Toevoegen van zoek- en sorteerfunctionaliteit aan de "Mijn Taken" sectie in het Dashboard, consistent met de bestaande Kanban.tsx implementatie. Dit zorgt voor een uniforme gebruikerservaring.

## Nieuwe Functionaliteit

| Feature | Beschrijving |
|---------|--------------|
| Sorteer dropdown | Keuze uit Deadline, Prioriteit, Aangemaakt |
| Sorteerrichting | Toggle knop met pijl omhoog/omlaag |
| Zoekbalk | Filter taken op titel/beschrijving |
| Keyboard shortcut | Druk `/` om direct naar zoekbalk te gaan |
| Persistentie | Voorkeuren worden opgeslagen in localStorage |

## Technische Wijzigingen

### Bestand: `src/components/dashboard/MyTasksFlowSection.tsx`

**1. Update imports (regel 1 en voeg nieuwe toe)**

Voeg `useRef` toe aan React imports en voeg nieuwe component/icon imports toe:
- Input component
- Select componenten (Select, SelectContent, SelectItem, SelectTrigger, SelectValue)
- Tooltip componenten
- Lucide icons: Search, ArrowUp, ArrowDown, ArrowUpDown, Calendar, AlertCircle, Clock

**2. Voeg priorityRank constante toe (na COLUMNS_TO_SHOW)**

```typescript
const priorityRank: Record<string, number> = {
  'CRITICAL': 4,
  'HIGH': 3,
  'MEDIUM': 2,
  'LOW': 1,
};
```

**3. Nieuwe state variabelen (in component)**

```typescript
const searchInputRef = useRef<HTMLInputElement>(null);

// Sorteer-voorkeur met localStorage persistentie
const [sortBy, setSortBy] = useState<'due_at' | 'priority' | 'created_at'>(() => {
  const stored = localStorage.getItem('mytasks-sort-by');
  return (stored as 'due_at' | 'priority' | 'created_at') || 'due_at';
});
const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() => {
  const stored = localStorage.getItem('mytasks-sort-direction');
  return (stored as 'asc' | 'desc') || 'asc';
});
const [searchQuery, setSearchQuery] = useState("");
```

**4. Nieuwe useEffect hooks**

- localStorage persistentie voor sorteervoorkeuren
- Keyboard shortcut handler (`/` om zoekbalk te focussen)

**5. Update getTasksForColumn functie**

Uitbreiden met:
- Zoekfilter op title en description
- Sortering op basis van sortBy en sortDirection

**6. Nieuwe Section Header UI**

Vervang de huidige header met:
- Responsieve layout (flex-col op mobile, flex-row op desktop)
- Sorteer dropdown met iconen per optie
- Sorteerrichting toggle met tooltip
- Zoekbalk met keyboard hint en Search icoon
- Team overzicht link

## Layout Structuur

```text
+--------------------------------------------------------+
| Mijn Taken [badge]                                      |
+--------------------------------------------------------+
| [Sorteer: Deadline ▼] [↑] | [🔍 Zoek taken... (/)] | [Team →] |
+--------------------------------------------------------+
```

Op mobile worden de controls gestapeld:

```text
+------------------------+
| Mijn Taken [badge]     |
+------------------------+
| [Sorteer ▼] [↑]        |
| [🔍 Zoek taken... (/)] |
| [Team overzicht →]     |
+------------------------+
```

## Accessibility

| Feature | Implementatie |
|---------|---------------|
| Keyboard navigatie | `/` shortcut voor zoekbalk |
| ARIA labels | `aria-label` op Input en Buttons |
| Screen readers | Tooltips voor sorteerrichting |
| Focus management | Ref voor programmatische focus |

## localStorage Keys

| Key | Type | Default |
|-----|------|---------|
| `mytasks-sort-by` | 'due_at' | 'priority' | 'created_at' | 'due_at' |
| `mytasks-sort-direction` | 'asc' | 'desc' | 'asc' |

## Geen Wijzigingen Aan

- Kanban.tsx (bestaande implementatie)
- Sidebar
- Routes
- Andere componenten/bestanden

## Samenvatting

| Stap | Actie |
|------|-------|
| 1 | Imports uitbreiden met Input, Select, Tooltip, extra icons |
| 2 | priorityRank constant toevoegen |
| 3 | State en ref voor sortBy, sortDirection, searchQuery |
| 4 | useEffect hooks voor localStorage en keyboard shortcut |
| 5 | getTasksForColumn functie uitbreiden met filter en sort |
| 6 | Header UI vervangen met controls |
