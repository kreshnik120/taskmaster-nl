
# Plan: Centrale Prioriteit-Kleur Systeem (PRIORITY_CONFIG)

## Probleem Geïdentificeerd

Na grondige analyse zijn er **7 VERSCHILLENDE prioriteit-kleursystemen** verspreid over de codebase:

| Component | Locatie | Probleem |
|-----------|---------|----------|
| TaskListTable.tsx | regels 34-39 | Lokale PRIORITY_COLORS |
| TaskListVirtualized.tsx | regels 33-38 | Duplicate PRIORITY_COLORS |
| TaskListSidePanel.tsx | regels 22-27 | Duplicate PRIORITY_COLORS |
| TaskListCards.tsx | regels 15-20 | Duplicate PRIORITY_COLORS |
| TaskDetailModal.tsx | regels 111-124 | Twee systemen: priorityConfig + PRIORITY_BADGE_STYLES |
| PriorityBadge.tsx | regels 15-36 | Eigen priorityConfig met alleen tekst |
| TaskDialog.tsx | regels 56-61 | PRIORITIES met andere kleuren |

**Visuele Inconsistentie:**
- "MEDIUM" is geel in lijstweergave, blauw in detail modal
- "HIGH" is oranje in lijstweergave, amber in detail modal  
- "LOW" is grijs in lijstweergave, groen in detail modal

---

## Oplossing: Eén Centrale Hook

Creëer `src/hooks/usePriorityConfig.ts` met:
- **Badge styles**: Voor gekleurde priority badges
- **Text styles**: Voor inline priority tekst
- **Icon mapping**: ArrowUp, ArrowDown, Minus, AlertCircle
- **Labels**: Nederlandse vertalingen (Laag, Gemiddeld, Hoog, Kritiek)

---

## Technische Details

### Nieuwe Hook: `src/hooks/usePriorityConfig.ts`

```text
type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface PriorityStyle {
  label: string;                    // "Laag", "Gemiddeld", etc.
  icon: LucideIcon;                 // ArrowDown, Minus, ArrowUp, AlertCircle
  // Badge variant (Apple-style subtle)
  badgeBg: string;                  // bg-emerald-500/15
  badgeText: string;                // text-emerald-700
  badgeBorder: string;              // border-emerald-400/30
  badgeDark: string;                // dark:bg-emerald-500/20 dark:text-emerald-400
  // Text-only variant
  textColor: string;                // text-emerald-600 dark:text-emerald-400
  textWeight: string;               // font-normal, font-medium, font-semibold, font-bold
  // Solid badge (voor compacte weergave)
  solidBg: string;                  // bg-emerald-500
  solidText: string;                // text-white
}

PRIORITY_CONFIG = {
  LOW: {
    label: "Laag",
    icon: ArrowDown,
    badgeBg: "bg-emerald-500/15",
    badgeText: "text-emerald-700",
    badgeBorder: "border-emerald-400/30",
    badgeDark: "dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/20",
    textColor: "text-emerald-600 dark:text-emerald-400",
    textWeight: "font-normal",
    solidBg: "bg-emerald-500",
    solidText: "text-white"
  },
  MEDIUM: {
    label: "Gemiddeld",
    icon: Minus,
    badgeBg: "bg-blue-500/15",
    badgeText: "text-blue-700",
    badgeBorder: "border-blue-400/30",
    badgeDark: "dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/20",
    textColor: "text-blue-600 dark:text-blue-400",
    textWeight: "font-medium",
    solidBg: "bg-blue-500",
    solidText: "text-white"
  },
  HIGH: {
    label: "Hoog",
    icon: ArrowUp,
    badgeBg: "bg-amber-500/15",
    badgeText: "text-amber-700",
    badgeBorder: "border-amber-400/30",
    badgeDark: "dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/20",
    textColor: "text-amber-600 dark:text-amber-400",
    textWeight: "font-semibold",
    solidBg: "bg-amber-500",
    solidText: "text-white"
  },
  CRITICAL: {
    label: "Kritiek",
    icon: AlertCircle,
    badgeBg: "bg-red-500/15",
    badgeText: "text-red-700",
    badgeBorder: "border-red-400/30",
    badgeDark: "dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/20",
    textColor: "text-red-600 dark:text-red-400",
    textWeight: "font-bold",
    solidBg: "bg-red-500",
    solidText: "text-white"
  }
}
```

### Helper Functies

```text
// Voor subtiele badges (modals, detail views)
getPriorityBadgeClass(priority: PriorityLevel): string
→ "bg-emerald-500/15 text-emerald-700 border-emerald-400/30 dark:bg-emerald-500/20..."

// Voor compacte solid badges (tabellen, lijsten)
getPrioritySolidClass(priority: PriorityLevel): string  
→ "bg-emerald-500 text-white"

// Voor inline tekst
getPriorityTextClass(priority: PriorityLevel): string
→ "text-emerald-600 dark:text-emerald-400 font-normal"

// Volledige config object
getPriorityConfig(priority: PriorityLevel): PriorityStyle
```

---

## Componenten Aanpassen

### Groep 1: TaskListView (4 bestanden)

| Bestand | Wijziging |
|---------|-----------|
| TaskListTable.tsx | Verwijder PRIORITY_COLORS/LABELS (regels 34-46), importeer hook |
| TaskListVirtualized.tsx | Verwijder PRIORITY_COLORS/LABELS (regels 33-45), importeer hook |
| TaskListSidePanel.tsx | Verwijder PRIORITY_COLORS/LABELS (regels 22-34), importeer hook |
| TaskListCards.tsx | Verwijder PRIORITY_COLORS/LABELS (regels 15-27), importeer hook |

**Badge usage:**
```text
// Was:
<Badge className={PRIORITY_COLORS[task.priority]}>
  {PRIORITY_LABELS[task.priority]}
</Badge>

// Wordt:
const { getPrioritySolidClass, getPriorityConfig } = usePriorityConfig();
const priorityStyle = getPriorityConfig(task.priority);
<Badge className={getPrioritySolidClass(task.priority)}>
  {priorityStyle.label}
</Badge>
```

### Groep 2: PriorityBadge.tsx

| Wijziging |
|-----------|
| Verwijder lokale priorityConfig (regels 15-36) |
| Importeer hook |
| Gebruik getPriorityTextClass() voor inline weergave |
| Behoud edit functionaliteit |

### Groep 3: TaskDetailModal.tsx

| Wijziging |
|-----------|
| Verwijder priorityConfig (regels 111-116) |
| Verwijder PRIORITY_BADGE_STYLES (regels 118-124) |
| Importeer hook |
| Gebruik getPriorityBadgeClass() voor subtiele badge |

### Groep 4: TaskDialog.tsx

| Wijziging |
|-----------|
| Verwijder PRIORITIES array (regels 56-61) |
| Importeer hook |
| Genereer opties dynamisch uit PRIORITY_CONFIG |

---

## Visueel Resultaat (Uniform)

| Prioriteit | Badge (Subtiel) | Badge (Solid) | Tekst |
|------------|----------------|---------------|-------|
| **LOW** | Groen/15% | Groen solid | Groen + normal |
| **MEDIUM** | Blauw/15% | Blauw solid | Blauw + medium |
| **HIGH** | Amber/15% | Amber solid | Amber + semibold |
| **CRITICAL** | Rood/15% | Rood solid | Rood + bold |

---

## Samenvatting Wijzigingen

| Actie | Aantal |
|-------|--------|
| **Nieuw bestand** | 1 (usePriorityConfig.ts) |
| **Bestanden aangepast** | 7 |
| **Lokale configs verwijderd** | 8 |
| **Duplicaat code verwijderd** | ~120 regels |
| **Dark mode support** | Automatisch |

---

## Voordelen

1. **Eén bron van waarheid** - Wijzig kleuren op één plek
2. **Consistentie** - Dezelfde prioriteit = dezelfde kleur overal
3. **Dark mode** - Automatisch correct
4. **Type-safety** - TypeScript enforced prioriteit waarden
5. **Onderhoud** - Makkelijker aanpassen en uitbreiden
6. **Minder code** - ~120 regels duplicaat verwijderd

---

## Implementatie Volgorde

1. Creëer `src/hooks/usePriorityConfig.ts` met complete config
2. Update TaskListView componenten (4 bestanden)
3. Update PriorityBadge.tsx
4. Update TaskDetailModal.tsx
5. Update TaskDialog.tsx
6. Test alle views op correcte weergave
