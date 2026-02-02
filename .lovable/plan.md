

# Expert Analyse: "Mijn Werk" Tab Kleurverfijning

## Huidige Situatie (Screenshot Analyse)

Op de screenshot zie ik dat de volgende elementen **WEL** al Indigo-gestyled zijn:
- ✅ Dashboard header icon (Indigo achtergrond + kleur)
- ✅ "Mijn Werk" subtitle onder Dashboard
- ✅ "Mijn Werk" tab (Indigo achtergrond + indicator)

Maar de volgende elementen zijn nog **NIET** in de Indigo context-kleur:

| Element | Huidige Kleur | Moet Worden |
|---------|---------------|-------------|
| "Vandaag Focus" icon | Purple (hardcoded) | Indigo (tab-mijn-werk-500) |
| "Vandaag Focus" card gradient | Purple gradient | Indigo gradient |
| "Mijn Taken" Kanban icon | Primary (blue) | Indigo |
| "+ Nieuwe taak" button | Primary (blue) | Indigo accent |
| Reminders bell icon bg | Primary/10 | Indigo |

---

## Visuele Vergelijking

```text
HUIDIGE SITUATIE                       NA VERFIJNING
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│  [🔵] Dashboard                  │   │  [🟣] Dashboard                  │
│       Mijn Werk                  │   │       Mijn Werk                  │
├──────────────────────────────────┤   ├──────────────────────────────────┤
│  ╔═══════════════╗               │   │  ╔═══════════════╗               │
│  ║ Mijn Werk ✓   ║  Kalender     │   │  ║ Mijn Werk ✓   ║  Kalender     │
│  ╚═══════════════╝               │   │  ╚═══════════════╝               │
├──────────────────────────────────┤   ├──────────────────────────────────┤
│  ┌─── 🟣 purple ───────────────┐ │   │  ┌─── 🟣 INDIGO ────────────────┐ │
│  │ ⊙ Vandaag Focus    3 items  │ │   │  │ ⊙ Vandaag Focus    3 items  │ │
│  │   (purple gradient bg)      │ │   │  │   (indigo gradient bg)      │ │
│  └─────────────────────────────┘ │   │  └─────────────────────────────┘ │
│                                  │   │                                  │
│  ┌─── 🔵 blue ─────────────────┐ │   │  ┌─── 🟣 INDIGO ────────────────┐ │
│  │ ⍁ Mijn Taken    5 taken     │ │   │  │ ⍁ Mijn Taken    5 taken     │ │
│  │   [+ Nieuwe taak] ← blue    │ │   │  │   [+ Nieuwe taak] ← INDIGO  │ │
│  └─────────────────────────────┘ │   │  └─────────────────────────────┘ │
│                                  │   │                                  │
└──────────────────────────────────┘   └──────────────────────────────────┘
```

---

## Wijzigingen Per Component

### 1. TodayFocusCard.tsx

**Locatie:** `src/components/dashboard/TodayFocusCard.tsx`

**Huidige code (regels 63, 85-86, 103, 106):**
```tsx
<Target className="h-5 w-5 text-purple-500" />
// ...
className="bg-gradient-to-br from-purple-50/80 to-white/60 dark:from-purple-950/30"
```

**Nieuwe code:**
```tsx
<Target className="h-5 w-5 text-tab-mijn-werk-500" />
// ...
className="bg-gradient-to-br from-tab-mijn-werk-50/80 to-white/60 dark:from-tab-mijn-werk-900/30"
```

### 2. MyTasksFlowSection.tsx

**Locatie:** `src/components/dashboard/MyTasksFlowSection.tsx`

**Huidige code (regel 464):**
```tsx
<Kanban className="h-5 w-5 text-primary" />
```

**Nieuwe code:**
```tsx
<Kanban className="h-5 w-5 text-tab-mijn-werk-500" />
```

**Huidige code (regel 545):**
```tsx
<Button onClick={() => setTaskDialogOpen(true)} size="sm" className="gap-2">
```

**Nieuwe code:**
```tsx
<Button 
  onClick={() => setTaskDialogOpen(true)} 
  size="sm" 
  className="gap-2 bg-tab-mijn-werk-500 hover:bg-tab-mijn-werk-600 text-white"
>
```

### 3. UpcomingRemindersWidget.tsx

**Locatie:** `src/components/UpcomingRemindersWidget.tsx`

**Huidige code (regel 85):**
```tsx
<div className="p-2 rounded-lg bg-primary/10">
  <Bell className="h-4 w-4 text-primary" />
</div>
```

**Nieuwe code:**
```tsx
<div className="p-2 rounded-lg bg-tab-mijn-werk-100 dark:bg-tab-mijn-werk-900/40">
  <Bell className="h-4 w-4 text-tab-mijn-werk-500" />
</div>
```

**Badge (regels 113-116):**
```tsx
// Huidige:
className="bg-primary/10 text-primary border-primary"

// Nieuwe:
className="bg-tab-mijn-werk-100 text-tab-mijn-werk-700 border-tab-mijn-werk-300 dark:bg-tab-mijn-werk-900/40 dark:text-tab-mijn-werk-300 dark:border-tab-mijn-werk-700"
```

---

## Resultaat Na Implementatie

| Element | Voor | Na |
|---------|------|-----|
| Vandaag Focus icon | `text-purple-500` | `text-tab-mijn-werk-500` |
| Vandaag Focus gradient | `from-purple-50/80` | `from-tab-mijn-werk-50/80` |
| Mijn Taken icon | `text-primary` | `text-tab-mijn-werk-500` |
| Nieuwe taak button | `bg-primary` | `bg-tab-mijn-werk-500` |
| Reminders icon | `text-primary` | `text-tab-mijn-werk-500` |
| Reminders badge | `text-primary` | `text-tab-mijn-werk-700` |

---

## Premium Touch: Extra Verfijningen

### A. Kolom Headers (Optioneel)

De Kanban kolom headers kunnen een subtiele Indigo border-top krijgen:

```tsx
// In MyTasksFlowSection.tsx - DroppableColumn Card
<Card className="h-full min-h-[200px] bg-muted/30 border-t-2 border-t-tab-mijn-werk-200">
```

### B. Empty State Icon (Optioneel)

```tsx
// Regel 563
<CheckCircle2 className="h-12 w-12 text-tab-mijn-werk-200 mb-4" />
```

---

## Verificatie Checklist

| Test | Verwacht |
|------|----------|
| Vandaag Focus | Indigo icon + gradient |
| Mijn Taken header | Indigo Kanban icon |
| Nieuwe taak button | Indigo achtergrond |
| Reminders widget | Indigo bell + badges |
| Dark mode | Kleuren correct lichter |
| Consistentie | Alle elementen matchen |

---

## Bestanden Te Wijzigen

| Bestand | Wijzigingen |
|---------|-------------|
| `src/components/dashboard/TodayFocusCard.tsx` | Icon + gradient kleuren |
| `src/components/dashboard/MyTasksFlowSection.tsx` | Kanban icon + button |
| `src/components/UpcomingRemindersWidget.tsx` | Bell icon + badge kleuren |

**Totaal: ~15 regels code wijzigingen**

