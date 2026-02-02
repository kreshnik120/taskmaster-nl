

# Herstel & Hernieuwde Implementatie - Fase 2 Indigo Verfijningen

## Probleem Analyse

Bij verificatie van de vorige implementatie blijkt dat de Fase 2 wijzigingen **niet correct zijn doorgevoerd**. De bestanden bevatten nog steeds de oude code.

## Te Repareren Wijzigingen

### 1. TodayFocusCard.tsx (4 fixes)

**Fix A: Empty state Target icon (regel 88)**
```tsx
// HUIDIG (FOUT):
<Target className="h-5 w-5 text-purple-500" />

// NIEUW:
<Target className="h-5 w-5 text-tab-mijn-werk-500" />
```

**Fix B: Badge styling (regel 108)**
```tsx
// HUIDIG:
<Badge variant="secondary" className="ml-auto">

// NIEUW:
<Badge className="ml-auto bg-tab-mijn-werk-100 text-tab-mijn-werk-700 border border-tab-mijn-werk-200 dark:bg-tab-mijn-werk-900/40 dark:text-tab-mijn-werk-300 dark:border-tab-mijn-werk-700">
```

**Fix C: Link buttons (regels 124, 143, 162)**
```tsx
// HUIDIG:
className="h-auto p-0 text-xs text-muted-foreground"

// NIEUW:
className="h-auto p-0 text-xs text-tab-mijn-werk-600 hover:text-tab-mijn-werk-700 dark:text-tab-mijn-werk-400 dark:hover:text-tab-mijn-werk-300"
```

---

### 2. MyTasksFlowSection.tsx (4 fixes)

**Fix A: Drag-over highlight (regel 121)**
```tsx
// HUIDIG:
isOver ? "bg-primary/5 rounded-lg" : ""

// NIEUW:
isOver ? "bg-tab-mijn-werk-100/50 dark:bg-tab-mijn-werk-900/30 rounded-lg ring-2 ring-tab-mijn-werk-300/50" : ""
```

**Fix B: Task count badge (regel 466)**
```tsx
// HUIDIG:
<Badge variant="secondary" className="ml-1">

// NIEUW:
<Badge className="ml-1 bg-tab-mijn-werk-100 text-tab-mijn-werk-700 border border-tab-mijn-werk-200 dark:bg-tab-mijn-werk-900/40 dark:text-tab-mijn-werk-300 dark:border-tab-mijn-werk-700">
```

**Fix C: Empty state icon (regel 563)**
```tsx
// HUIDIG:
<CheckCircle2 className="h-12 w-12 text-muted-foreground/30 mb-4" />

// NIEUW:
<CheckCircle2 className="h-12 w-12 text-tab-mijn-werk-200 dark:text-tab-mijn-werk-800 mb-4" />
```

**Fix D: Kolom card border-top (regel 588)**
```tsx
// HUIDIG:
<Card className="h-full min-h-[200px] bg-muted/30">

// NIEUW:
<Card className="h-full min-h-[200px] bg-muted/30 border-t-2 border-t-tab-mijn-werk-200 dark:border-t-tab-mijn-werk-800">
```

---

### 3. UpcomingRemindersWidget.tsx (1 fix)

**Fix: Reminder item hover (regel 107)**
```tsx
// HUIDIG:
className="... bg-muted/30 hover:bg-muted/50 ..."

// NIEUW:
className="... bg-muted/30 hover:bg-tab-mijn-werk-50 dark:hover:bg-tab-mijn-werk-900/20 ..."
```

---

## Samenvatting Wijzigingen

| Bestand | Aantal fixes |
|---------|--------------|
| `TodayFocusCard.tsx` | 4 (icon + badge + 3x links) |
| `MyTasksFlowSection.tsx` | 4 (dragover + badge + empty + border) |
| `UpcomingRemindersWidget.tsx` | 1 (hover state) |

**Totaal: 9 specifieke code wijzigingen**

---

## Verificatie Na Implementatie

| Element | Controle |
|---------|----------|
| TodayFocus empty state | Target icon is Indigo |
| TodayFocus badge | Indigo accent styling |
| TodayFocus links | Indigo link kleur |
| Mijn Taken badge | Indigo accent styling |
| Drag-drop hover | Indigo glow + ring effect |
| Empty kanban | Indigo-200 icon |
| Kolom headers | Indigo top border |
| Reminder hover | Warme Indigo hover |
| Dark mode | Alle kleuren correct |

