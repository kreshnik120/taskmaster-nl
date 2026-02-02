

# Fase 14: Expert Polish — Final Refinements

## Executive Summary

Na grondige analyse van de gehele codebase heb ik de volgende **9 specifieke verbeterpunten** geïdentificeerd die de Apple visionOS esthetiek nog verder zullen verfijnen. Deze gaps breken momenteel de visuele consistentie van het design system.

---

## Geïdentificeerde Gaps (Expert Analyse)

| # | Component | Huidige Status | Probleem |
|---|-----------|----------------|----------|
| 1 | `UpcomingTasksList.tsx` | Geen glass styling | Inconsistent met `OverdueTasksList` |
| 2 | `SourceProgress.tsx` | Geen glass styling | Inconsistent met `AssigneeProgress` |
| 3 | `TaskListSidePanel.tsx` | `bg-background border-l` | Geen glass behandeling |
| 4 | `TaskListCards.tsx` | `hover:bg-muted/50` | Simpele hover, geen glass |
| 5 | `TaskListTable.tsx` | `hover:bg-muted/50` | Geen glass row styling |
| 6 | `TaskListToolbar.tsx` | Basis Input styling | Geen glass search input |
| 7 | `Layout.tsx` main header | Geen styling | Header bar zonder glass |
| 8 | `AppSidebar.tsx` footer | Basis styling | User card zonder glass |
| 9 | `TaskListFilterPills.tsx` | Basis buttons | Geen glass pill styling |

---

## Prioriteit 1: UpcomingTasksList — Slate Glass Styling

**Bestand:** `src/components/dashboard-stats/UpcomingTasksList.tsx`

**Probleem:** De `UpcomingTasksList` gebruikt `p-3 rounded-lg border` terwijl `OverdueTasksList` glassmorphism heeft.

**Oplossing:** Voeg slate-tinted glass styling toe (consistent met Lijst tab context).

**Wijzigingen (regels 72-89):**

```tsx
// Card container upgrade
<Card className="glass-card-slate">
  ...
</Card>

// Task item upgrade (regel 88)
<div
  key={task.id}
  onClick={() => handleClick(task.id)}
  className={cn(
    "p-3 rounded-xl transition-all duration-200 cursor-pointer group",
    "bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm",
    "border border-white/30 dark:border-white/12",
    "shadow-[0_2px_6px_hsla(215,25%,48%,0.06)]",
    "hover:bg-white/80 dark:hover:bg-slate-800/80",
    "hover:shadow-[0_4px_12px_hsla(215,25%,48%,0.12)]"
  )}
>
```

---

## Prioriteit 2: SourceProgress — Violet Glass Styling

**Bestand:** `src/components/dashboard-stats/SourceProgress.tsx`

**Probleem:** De `SourceProgress` component heeft geen glassmorphism terwijl `AssigneeProgress` dat wel heeft.

**Oplossing:** Voeg violet-tinted glass styling toe (Team tab context).

**Wijzigingen (regels 56-79):**

```tsx
// Card container upgrade
<Card className="glass-card-violet">
  ...
</Card>

// Source item upgrade (regel 75)
<div
  key={source.sourceId || 'manual'}
  onClick={() => handleClick(source.sourceId)}
  className={cn(
    "p-3 rounded-xl transition-all duration-200",
    "bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm",
    "border border-white/30 dark:border-white/12",
    "shadow-[0_2px_6px_hsla(270,45%,55%,0.06)]",
    isClickable && "cursor-pointer hover:bg-white/80 dark:hover:bg-slate-800/80 hover:shadow-[0_4px_12px_hsla(270,45%,55%,0.12)]"
  )}
>

// Icon container upgrade (regel 81)
<div className="p-2 rounded-full bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm">
```

---

## Prioriteit 3: TaskListSidePanel — Premium Glass Panel

**Bestand:** `src/components/TaskListView/TaskListSidePanel.tsx`

**Probleem:** De side panel gebruikt `bg-background border-l shadow-xl` zonder glassmorphism.

**Oplossing:** Voeg premium glass styling toe met slate-tinted blur.

**Wijzigingen (regel 120):**

```tsx
// Panel wrapper upgrade
className="fixed right-0 top-0 z-50 h-full w-full max-w-md 
  bg-white/90 dark:bg-slate-900/90 
  backdrop-blur-xl 
  border-l border-white/40 dark:border-white/12 
  shadow-[0_0_60px_hsla(215,25%,48%,0.15),-10px_0_40px_hsla(215,25%,48%,0.08)]
  outline-none"
```

---

## Prioriteit 4: TaskListCards — Glass Mobile Cards

**Bestand:** `src/components/TaskListView/TaskListCards.tsx`

**Probleem:** Mobile cards gebruiken `hover:bg-muted/50` zonder glassmorphism.

**Oplossing:** Voeg slate glass styling toe voor mobiele weergave.

**Wijzigingen (regels 53-60):**

```tsx
// Card upgrade
<Card
  key={task.id}
  role="listitem"
  aria-label={generateTaskAriaLabel(task)}
  className={cn(
    "cursor-pointer transition-all duration-200",
    "bg-white/75 dark:bg-slate-900/75 backdrop-blur-sm",
    "border-white/40 dark:border-white/12",
    "shadow-[0_2px_6px_hsla(215,25%,48%,0.06)]",
    "hover:bg-white/90 dark:hover:bg-slate-800/90",
    "hover:shadow-[0_4px_12px_hsla(215,25%,48%,0.12)]",
    overdue && "border-destructive/50"
  )}
  onClick={() => onTaskSelect?.(task)}
>
```

---

## Prioriteit 5: TaskListTable — Glass Row Hover

**Bestand:** `src/components/TaskListView/TaskListTable.tsx`

**Probleem:** Table rows gebruiken `hover:bg-muted/50` zonder glass effect.

**Oplossing:** Voeg subtiele glass hover toe aan table rows.

**Wijzigingen (regels 139-143):**

```tsx
// TableRow upgrade
className={cn(
  'cursor-pointer transition-all duration-150',
  isSelected && 'bg-accent/50',
  isFocused && 'ring-2 ring-primary ring-inset',
  !isSelected && !isFocused && 'hover:bg-white/60 dark:hover:bg-slate-800/60'
)}
```

**Table container upgrade (regel 103):**

```tsx
<div className="rounded-xl border border-white/40 dark:border-white/12 overflow-hidden bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm">
```

---

## Prioriteit 6: TaskListToolbar — Glass Search Input

**Bestand:** `src/components/TaskListView/TaskListToolbar.tsx`

**Probleem:** Search input heeft basis styling zonder glass treatment.

**Oplossing:** Voeg glass styling toe aan search input.

**Wijzigingen (regels 66-73):**

```tsx
// Input upgrade
<Input
  ref={searchInputRef}
  type="text"
  placeholder="Zoek taken... (druk / om te zoeken)"
  value={searchInput}
  onChange={(e) => setSearchInput(e.target.value)}
  className="pl-9 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-white/40 dark:border-white/12 focus:bg-white/80 dark:focus:bg-slate-800/80 transition-all duration-200"
/>
```

**Sort buttons upgrade (regels 79-97):**

```tsx
// Sort button upgrade
<Button 
  variant="outline" 
  size="sm" 
  className="gap-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-white/40 dark:border-white/12 hover:bg-white/80 dark:hover:bg-slate-800/80"
>
```

---

## Prioriteit 7: Layout Header — Glass Header Bar

**Bestand:** `src/components/Layout.tsx`

**Probleem:** Header bar met SidebarTrigger en NotificationBell heeft geen styling.

**Oplossing:** Voeg subtiele glass header styling toe.

**Wijzigingen (regels 66-73):**

```tsx
// Header bar upgrade
<div className="mb-4 flex items-center justify-between p-3 -mx-3 rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10">
  <SidebarTrigger />
  <div className="flex items-center gap-2">
    <SecurityAlertBell />
    <NotificationBell onNotificationClick={handleNotificationClick} />
  </div>
</div>
```

---

## Prioriteit 8: AppSidebar Footer — Glass User Card

**Bestand:** `src/components/AppSidebar.tsx`

**Probleem:** User card in sidebar footer heeft basis styling.

**Oplossing:** Voeg subtiele glass behandeling toe.

**Wijzigingen (regels 358-371):**

```tsx
// User button upgrade
<Button 
  variant="ghost" 
  className="w-full justify-start gap-3 px-3 py-2 h-auto 
    hover:bg-white/60 dark:hover:bg-slate-800/60 
    rounded-xl transition-all duration-200
    bg-white/30 dark:bg-slate-900/30
    border border-white/20 dark:border-white/8"
>
  <Avatar className="h-8 w-8 ring-2 ring-white/20 dark:ring-white/10">
    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
  </Avatar>
  ...
</Button>
```

---

## Prioriteit 9: TaskListFilterPills — Glass Pills

**Bestand:** `src/components/TaskListView/TaskListFilterPills.tsx`

**Probleem:** Filter pills gebruiken standaard Button styling zonder glass.

**Oplossing:** Voeg glass pill styling toe.

**Wijzigingen (regels 28-36 en 41-51):**

```tsx
// "Alle" button upgrade
<Button
  variant={hasActiveFilters ? 'outline' : 'default'}
  size="sm"
  onClick={onClearAll}
  className={cn(
    'shrink-0 rounded-full text-xs font-medium transition-all duration-200',
    !hasActiveFilters 
      ? 'bg-primary text-primary-foreground shadow-[0_2px_6px_hsla(221,83%,53%,0.2)]' 
      : 'bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-white/40 dark:border-white/12 hover:bg-white/80'
  )}
>

// Filter pill buttons upgrade
<Button
  key={filter}
  variant={isActive ? 'default' : 'outline'}
  size="sm"
  onClick={() => onToggleFilter(filter)}
  className={cn(
    'shrink-0 rounded-full text-xs font-medium transition-all duration-200',
    !isActive && 'bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border-white/40 dark:border-white/12 hover:bg-white/80',
    isActive && 'shadow-[0_2px_6px_hsla(221,83%,53%,0.2)]',
    filter === 'critical' && isActive && 'bg-destructive shadow-[0_2px_6px_hsla(0,84%,60%,0.2)]',
    filter === 'due_today' && isActive && 'bg-orange-500 shadow-[0_2px_6px_hsla(24,95%,53%,0.2)]'
  )}
>
```

---

## CSS Toevoegingen

**Bestand:** `src/index.css`

Voeg de volgende utility classes toe:

```css
/* ============================================
   PHASE 14: ADDITIONAL GLASS UTILITIES
   ============================================ */

/* Slate-tinted glass card for Lijst/Klanten context */
.glass-card-slate {
  position: relative;
  overflow: hidden;
  border-radius: 0.75rem;
  background: linear-gradient(135deg, hsla(215, 25%, 97%, 0.75) 0%, hsla(215, 25%, 97%, 0.45) 100%);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid hsla(215, 25%, 88%, 0.5);
  box-shadow: 0 4px 12px hsla(215, 25%, 48%, 0.08), 0 8px 32px hsla(215, 25%, 48%, 0.12);
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.dark .glass-card-slate {
  background: linear-gradient(135deg, hsla(215, 25%, 26%, 0.55) 0%, hsla(215, 25%, 20%, 0.35) 100%);
  border-color: hsla(215, 25%, 40%, 0.35);
  box-shadow: 0 4px 12px hsla(215, 25%, 15%, 0.25), 0 8px 32px hsla(215, 25%, 10%, 0.35);
}

/* Glass search input */
.glass-search-input {
  background: rgba(255, 255, 255, 0.60);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.40);
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.glass-search-input:focus {
  background: rgba(255, 255, 255, 0.80);
  border-color: rgba(255, 255, 255, 0.50);
}

.dark .glass-search-input {
  background: rgba(30, 41, 59, 0.60);
  border-color: rgba(255, 255, 255, 0.12);
}

.dark .glass-search-input:focus {
  background: rgba(30, 41, 59, 0.80);
}

/* Glass panel shadow for side panels */
.glass-panel-shadow {
  box-shadow: 
    0 0 60px hsla(215, 25%, 48%, 0.15),
    -10px 0 40px hsla(215, 25%, 48%, 0.08);
}

.dark .glass-panel-shadow {
  box-shadow: 
    0 0 60px hsla(215, 25%, 15%, 0.40),
    -10px 0 40px hsla(215, 25%, 10%, 0.25);
}
```

---

## Samenvatting Bestanden

| Bestand | Wijzigingen |
|---------|-------------|
| `src/components/dashboard-stats/UpcomingTasksList.tsx` | Glass card + items |
| `src/components/dashboard-stats/SourceProgress.tsx` | Glass card + items |
| `src/components/TaskListView/TaskListSidePanel.tsx` | Glass panel |
| `src/components/TaskListView/TaskListCards.tsx` | Glass mobile cards |
| `src/components/TaskListView/TaskListTable.tsx` | Glass table container + rows |
| `src/components/TaskListView/TaskListToolbar.tsx` | Glass search + buttons |
| `src/components/Layout.tsx` | Glass header bar |
| `src/components/AppSidebar.tsx` | Glass user card |
| `src/components/TaskListView/TaskListFilterPills.tsx` | Glass filter pills |
| `src/index.css` | +40 regels utilities |

---

## Visueel Resultaat

```text
┌──────────────────────────────────────────────────────────────┐
│  DASHBOARD — LIJST TAB (Slate Context)                       │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  🔍 [Glass Search Input]        [Sort ▼] [↕]            │ │
│  │  ░░░ GLASS SEARCH BAR ░░░                               │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  [Alle] [Open] [In Progress] [Review] [Kritiek] [Vandaag]   │
│   ░░░ GLASS FILTER PILLS ░░░                                │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  ░░░ GLASS TABLE CONTAINER ░░░                          │ │
│  │  ┌───────────────────────────────────────────────────┐  │ │
│  │  │  ☐ │ Taak Titel         │ Eigenaar │ Prio │ Date │  │ │
│  │  ├───────────────────────────────────────────────────┤  │ │
│  │  │  ☐ │ Intake gesprek...  │ 👤 Jan   │ Hoog │ 5 feb│  │ │
│  │  │      ░░░ GLASS ROW HOVER ░░░                      │  │ │
│  │  └───────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────┐                │
│  │  📅 KOMENDE WEEK                         │                │
│  │  ░░░ GLASS CARD (slate) ░░░              │                │
│  │  ┌────────────────────────────────────┐  │                │
│  │  │  📋 Review sollicitant             │  │                │
│  │  │      ░░░ GLASS LIST ITEM ░░░       │  │                │
│  │  └────────────────────────────────────┘  │                │
│  └──────────────────────────────────────────┘                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Design Principes (Apple visionOS)

| Principe | Implementatie |
|----------|---------------|
| **Layered Materials** | Geneste blur niveaus (8px input, 20px panels) |
| **Context Shadows** | Elke component erft tab-specifieke HSL kleur |
| **Subtle Depth** | Multi-layer shadows simuleren omgevingslicht |
| **Interactive Feedback** | Hover met verhoogde opacity en shadow |
| **No Transforms** | Shadow-only hover (DnD compatibel) |
| **Dark Mode Ready** | Alle HSL-based styling met `.dark` varianten |

---

## Acceptatiecriteria

1. `UpcomingTasksList` heeft slate glassmorphism consistent met `OverdueTasksList`
2. `SourceProgress` heeft violet glassmorphism consistent met `AssigneeProgress`
3. `TaskListSidePanel` heeft premium glass backdrop met blur
4. Mobile `TaskListCards` hebben glass styling
5. `TaskListTable` heeft glass container en row hovers
6. Search input en sort buttons hebben glass styling
7. Layout header heeft subtiele glass behandeling
8. Sidebar user card heeft glass styling
9. Filter pills hebben glass styling met context shadows
10. Alle componenten zijn dark mode compatibel

