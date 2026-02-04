

# Plan: Voltooiing Prioriteit-Systeem (3 Ontbrekende Bestanden)

## Probleem Geïdentificeerd

Na grondige analyse zijn er **3 bestanden** die nog NIET de centrale `usePriorityConfig` hook gebruiken:

| Bestand | Type Probleem |
|---------|---------------|
| **VerwijderdeTaken.tsx** | Lokale `priorityColors` + `priorityLabels` |
| **AfgerondeTaken.tsx** | Lokale `priorityColors` + `priorityLabels` |
| **EmbeddedListView.tsx** | Lokale `priorityLabels` (voor groupBy) |

### Extra Inconsistentie
De lokale labels gebruiken **"Middel"** terwijl de centrale hook **"Gemiddeld"** gebruikt!

---

## Wijzigingen Per Bestand

### 1. VerwijderdeTaken.tsx

**Huidige code (regels 47-59):**
```tsx
const priorityColors: Record<string, string> = {
  LOW: "text-priority-low",
  MEDIUM: "text-priority-medium",
  HIGH: "text-priority-high",
  CRITICAL: "text-priority-critical",
};

const priorityLabels: Record<string, string> = {
  LOW: "Laag",
  MEDIUM: "Middel",  // ← FOUT: moet "Gemiddeld" zijn
  HIGH: "Hoog",
  CRITICAL: "Kritiek",
};
```

**Badge gebruik (regel 271-272):**
```tsx
<Badge variant="secondary" className={priorityColors[task.priority]}>
  {priorityLabels[task.priority]}
</Badge>
```

**Actie:**
- Verwijder lokale `priorityColors` en `priorityLabels` constanten
- Import toevoegen: `import { getPrioritySolidClass, getPriorityLabel } from '@/hooks/usePriorityConfig';`
- Badge aanpassen naar centrale hook

**Nieuwe Badge code:**
```tsx
<Badge className={getPrioritySolidClass(task.priority)}>
  {getPriorityLabel(task.priority)}
</Badge>
```

---

### 2. AfgerondeTaken.tsx

**Huidige code (regels 39-51):**
```tsx
const priorityColors: Record<string, string> = {
  LOW: "text-priority-low",
  MEDIUM: "text-priority-medium",
  HIGH: "text-priority-high",
  CRITICAL: "text-priority-critical",
};

const priorityLabels: Record<string, string> = {
  LOW: "Laag",
  MEDIUM: "Middel",  // ← FOUT: moet "Gemiddeld" zijn
  HIGH: "Hoog",
  CRITICAL: "Kritiek",
};
```

**Badge gebruik (regel 174-175):**
```tsx
<Badge variant="secondary" className={priorityColors[task.priority]}>
  {priorityLabels[task.priority]}
</Badge>
```

**Actie:**
- Verwijder lokale `priorityColors` en `priorityLabels` constanten
- Import toevoegen: `import { getPrioritySolidClass, getPriorityLabel } from '@/hooks/usePriorityConfig';`
- Badge aanpassen naar centrale hook

**Nieuwe Badge code:**
```tsx
<Badge className={getPrioritySolidClass(task.priority)}>
  {getPriorityLabel(task.priority)}
</Badge>
```

---

### 3. EmbeddedListView.tsx

**Huidige code (regels 76-81):**
```tsx
const priorityLabels = {
  LOW: "Laag",
  MEDIUM: "Gemiddeld",
  HIGH: "Hoog",
  CRITICAL: "Kritiek",
};
```

**Gebruik voor groupBy (regel 552):**
```tsx
} else if (groupBy === "priority") {
  key = priorityLabels[task.priority as keyof typeof priorityLabels];
}
```

**Actie:**
- Verwijder lokale `priorityLabels` constante
- Import toevoegen: `import { getPriorityLabel } from '@/hooks/usePriorityConfig';`
- GroupBy aanpassen naar centrale hook

**Nieuwe GroupBy code:**
```tsx
} else if (groupBy === "priority") {
  key = getPriorityLabel(task.priority);
}
```

---

## Visueel Resultaat

Na implementatie: **ALLE prioriteiten** in de applicatie tonen dezelfde kleuren en labels:

| Prioriteit | Badge Kleur | Label |
|------------|-------------|-------|
| LOW | Groen solid | Laag |
| MEDIUM | Blauw solid | Gemiddeld |
| HIGH | Amber solid | Hoog |
| CRITICAL | Rood solid | Kritiek |

---

## Samenvatting

| Actie | Aantal |
|-------|--------|
| Bestanden aangepast | 3 |
| Lokale constanten verwijderd | 5 |
| Imports toegevoegd | 3 |
| Label inconsistenties opgelost | 2 ("Middel" → "Gemiddeld") |

---

## Resultaat Na Implementatie

| Bestand | Status |
|---------|--------|
| usePriorityConfig.ts | ✅ Centrale bron |
| TaskListTable.tsx | ✅ Klaar |
| TaskListVirtualized.tsx | ✅ Klaar |
| TaskListSidePanel.tsx | ✅ Klaar |
| TaskListCards.tsx | ✅ Klaar |
| PriorityBadge.tsx | ✅ Klaar |
| TaskDetailModal.tsx | ✅ Klaar |
| TaskDialog.tsx | ✅ Klaar |
| **VerwijderdeTaken.tsx** | 🔄 → ✅ |
| **AfgerondeTaken.tsx** | 🔄 → ✅ |
| **EmbeddedListView.tsx** | 🔄 → ✅ |

**Totaal: 11/11 componenten = 100% consistentie**

