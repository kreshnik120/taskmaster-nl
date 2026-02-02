

# Verdere Verfijning "Mijn Werk" Pagina - Fase 2

## Gevonden Issues uit Vorige Implementatie

Bij analyse van de code zie ik **1 gemiste wijziging** en **meerdere nieuwe verfijningsmogelijkheden**:

### Gemiste Wijziging (Kritiek)
| Locatie | Regel | Issue |
|---------|-------|-------|
| `TodayFocusCard.tsx` | 88 | Target icon nog `text-purple-500` in empty state |

---

## Nieuwe Verfijningsmogelijkheden

### Visuele Hiërarchie Analyse

```text
┌─────────────────────────────────────────────────────────────────┐
│  MIJN WERK TAB - VERFIJNING FASE 2                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─── TodayFocusCard ─────────────────────────────────────────┐ │
│  │  ⊙ Vandaag Focus                                           │ │
│  │     └─ Target icon: ✅ (regel 63, 106)                     │ │
│  │     └─ Target icon empty: ❌ nog purple (regel 88)         │ │
│  │     └─ Card gradient: ✅                                   │ │
│  │     └─ Badge: nog "secondary" → Indigo variant?            │ │
│  │     └─ Links "Bekijk..." → Indigo accent?                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─── MyTasksFlowSection ─────────────────────────────────────┐ │
│  │  ⍁ Mijn Taken                                              │ │
│  │     └─ Kanban icon: ✅                                     │ │
│  │     └─ "+ Nieuwe taak" button: ✅                          │ │
│  │     └─ Badge "X taken": nog "secondary"                    │ │
│  │     └─ Kolom headers: neutrale styling → border-top?       │ │
│  │     └─ Empty state icon: nog muted → Indigo-200?           │ │
│  │     └─ Drag overlay: primary/5 → indigo/5?                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─── UpcomingRemindersWidget ────────────────────────────────┐ │
│  │  🔔 Aankomende herinneringen                               │ │
│  │     └─ Bell icon: ✅                                       │ │
│  │     └─ Badge: ✅                                           │ │
│  │     └─ Card hover items: neutrale muted → subtiel indigo?  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Wijzigingen Per Component

### 1. TodayFocusCard.tsx - Kritieke Fix + Verfijning

**Fix: Gemiste Target icon (regel 88)**
```tsx
// Huidig (FOUT):
<Target className="h-5 w-5 text-purple-500" />

// Nieuw:
<Target className="h-5 w-5 text-tab-mijn-werk-500" />
```

**Verfijning: Badge styling (regel 108-110)**
```tsx
// Huidig:
<Badge variant="secondary" className="ml-auto">

// Nieuw - subtiele Indigo accent:
<Badge className="ml-auto bg-tab-mijn-werk-100 text-tab-mijn-werk-700 border-tab-mijn-werk-200 dark:bg-tab-mijn-werk-900/40 dark:text-tab-mijn-werk-300">
```

**Verfijning: Link buttons (regels 121-128, 140-147, 159-166)**
```tsx
// Huidig:
<Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground">

// Nieuw - Indigo link kleur:
<Button variant="link" size="sm" className="h-auto p-0 text-xs text-tab-mijn-werk-600 hover:text-tab-mijn-werk-700 dark:text-tab-mijn-werk-400 dark:hover:text-tab-mijn-werk-300">
```

---

### 2. MyTasksFlowSection.tsx - Premium Touches

**Verfijning: Task count badge (regel 466-468)**
```tsx
// Huidig:
<Badge variant="secondary" className="ml-1">

// Nieuw:
<Badge className="ml-1 bg-tab-mijn-werk-100 text-tab-mijn-werk-700 border-tab-mijn-werk-200 dark:bg-tab-mijn-werk-900/40 dark:text-tab-mijn-werk-300">
```

**Verfijning: Drag-over highlight (regel 121)**
```tsx
// Huidig:
isOver ? "bg-primary/5 rounded-lg" : ""

// Nieuw:
isOver ? "bg-tab-mijn-werk-100/50 dark:bg-tab-mijn-werk-900/30 rounded-lg ring-2 ring-tab-mijn-werk-300/50" : ""
```

**Verfijning: Empty state icon (regel 563)**
```tsx
// Huidig:
<CheckCircle2 className="h-12 w-12 text-muted-foreground/30 mb-4" />

// Nieuw:
<CheckCircle2 className="h-12 w-12 text-tab-mijn-werk-200 dark:text-tab-mijn-werk-800 mb-4" />
```

**Verfijning: Kolom card border-top (regel 588)**
```tsx
// Huidig:
<Card className="h-full min-h-[200px] bg-muted/30">

// Nieuw - subtiele Indigo accent:
<Card className="h-full min-h-[200px] bg-muted/30 border-t-2 border-t-tab-mijn-werk-200 dark:border-t-tab-mijn-werk-800">
```

---

### 3. UpcomingRemindersWidget.tsx - Hover States

**Verfijning: Reminder item hover (regel 107)**
```tsx
// Huidig:
className="... bg-muted/30 hover:bg-muted/50 ..."

// Nieuw - subtiele Indigo hover:
className="... bg-muted/30 hover:bg-tab-mijn-werk-50 dark:hover:bg-tab-mijn-werk-900/20 ..."
```

---

## Resultaat Na Implementatie

| Element | Voor | Na |
|---------|------|-----|
| TodayFocus empty icon | `text-purple-500` | `text-tab-mijn-werk-500` |
| TodayFocus badge | `variant="secondary"` | Custom Indigo |
| TodayFocus links | `text-muted-foreground` | `text-tab-mijn-werk-600` |
| Mijn Taken badge | `variant="secondary"` | Custom Indigo |
| Drag-over effect | `bg-primary/5` | `bg-tab-mijn-werk-100/50` |
| Empty state icon | `text-muted-foreground/30` | `text-tab-mijn-werk-200` |
| Kolom headers | Geen border-top | Indigo border-top |
| Reminder hover | `hover:bg-muted/50` | `hover:bg-tab-mijn-werk-50` |

---

## Verificatie Checklist

| Test | Verwacht |
|------|----------|
| TodayFocus empty state | Target icon is Indigo |
| TodayFocus badge | Indigo accent styling |
| TodayFocus links | Indigo link kleur |
| Mijn Taken badge | Indigo accent styling |
| Drag-drop hover | Indigo glow effect |
| Empty kanban | Indigo-200 icon |
| Kolom headers | Subtiele Indigo top border |
| Reminder hover | Warme Indigo hover |
| Dark mode | Alle kleuren correct |

---

## Bestanden Te Wijzigen

| Bestand | Wijzigingen |
|---------|-------------|
| `src/components/dashboard/TodayFocusCard.tsx` | 4 wijzigingen (icon fix + badge + 3x links) |
| `src/components/dashboard/MyTasksFlowSection.tsx` | 4 wijzigingen (badge + dragover + empty + border) |
| `src/components/UpcomingRemindersWidget.tsx` | 1 wijziging (hover state) |

**Totaal: ~9 regels code wijzigingen**

