

# Plan: Voltooiing Prioriteit-Systeem - accessibility.ts

## Probleem

Er is nog **1 bestand** dat een lokale `priorityLabels` definitie bevat:

**Bestand:** `src/components/TaskListView/utils/accessibility.ts`

**Huidige code (regels 29-36):**
```typescript
if (task.priority) {
  const priorityLabels: Record<string, string> = {
    CRITICAL: 'Kritiek',
    HIGH: 'Hoog',
    MEDIUM: 'Gemiddeld',
    LOW: 'Laag',
  };
  parts.push(`prioriteit ${priorityLabels[task.priority] || task.priority}`);
}
```

---

## Oplossing

### Wijzigingen

**1. Import toevoegen (regel 1-2):**
```typescript
import type { TaskListTask } from '../types';
import { getPriorityLabel } from '@/hooks/usePriorityConfig';
```

**2. Lokale priorityLabels verwijderen en vervangen (regels 29-36):**
```typescript
if (task.priority) {
  parts.push(`prioriteit ${getPriorityLabel(task.priority)}`);
}
```

---

## Wat NIET gefixed hoeft te worden

De volgende bestanden hebben **ANDERE prioriteit-systemen** (numeriek/score-based) en zijn correct apart:

| Bestand | Systeem | Reden Behouden |
|---------|---------|----------------|
| HumanReviewQueue.tsx | Numeriek 1-10 | AI Review prioriteit, niet task prioriteit |
| AlertPriorityRanker.tsx | Score 0-100 | AI Training scores, niet task prioriteit |

Deze gebruiken geen LOW/MEDIUM/HIGH/CRITICAL en mogen hun eigen logica behouden.

---

## Resultaat Na Implementatie

| Component | Status |
|-----------|--------|
| usePriorityConfig.ts | ✅ Centrale bron |
| TaskListTable.tsx | ✅ |
| TaskListVirtualized.tsx | ✅ |
| TaskListSidePanel.tsx | ✅ |
| TaskListCards.tsx | ✅ |
| PriorityBadge.tsx | ✅ |
| TaskDetailModal.tsx | ✅ |
| TaskDialog.tsx | ✅ |
| VerwijderdeTaken.tsx | ✅ |
| AfgerondeTaken.tsx | ✅ |
| EmbeddedListView.tsx | ✅ |
| **accessibility.ts** | 🔄 → ✅ |

**Totaal: 12/12 = 100% consistentie**

---

## Samenvatting

| Actie | Aantal |
|-------|--------|
| Bestanden aangepast | 1 |
| Imports toegevoegd | 1 |
| Lokale constanten verwijderd | 1 |
| Regels code verwijderd | 6 |

