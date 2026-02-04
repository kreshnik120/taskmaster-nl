
# Plan: Centrale Prioriteit-Kleur Systeem (PRIORITY_CONFIG)

## Status: ✅ VOLTOOID

Geïmplementeerd op: 2026-02-04

---

## Oplossing Geïmplementeerd

Creëerde `src/hooks/usePriorityConfig.ts` met:
- **Badge styles**: Voor gekleurde priority badges (subtiel + solid)
- **Text styles**: Voor inline priority tekst
- **Icon mapping**: ArrowUp, ArrowDown, Minus, AlertCircle
- **Labels**: Nederlandse vertalingen (Laag, Gemiddeld, Hoog, Kritiek)
- **Dark mode support**: Automatisch correct

---

## Geüpdatete Componenten (7 bestanden)

| Bestand | Status |
|---------|--------|
| TaskListTable.tsx | ✅ Voltooid |
| TaskListVirtualized.tsx | ✅ Voltooid |
| TaskListSidePanel.tsx | ✅ Voltooid |
| TaskListCards.tsx | ✅ Voltooid |
| PriorityBadge.tsx | ✅ Voltooid |
| TaskDetailModal.tsx | ✅ Voltooid |
| TaskDialog.tsx | ✅ Voltooid |

---

## Uniform Kleursysteem

| Prioriteit | Badge (Subtiel) | Badge (Solid) | Tekst |
|------------|----------------|---------------|-------|
| **LOW** | Groen/15% | Groen solid | Groen + normal |
| **MEDIUM** | Blauw/15% | Blauw solid | Blauw + medium |
| **HIGH** | Amber/15% | Amber solid | Amber + semibold |
| **CRITICAL** | Rood/15% | Rood solid | Rood + bold |

---

## Helper Functies Beschikbaar

```typescript
import { 
  getPriorityConfig,      // Volledige config object
  getPriorityBadgeClass,  // Subtiele badges (modals)
  getPrioritySolidClass,  // Solid badges (tabellen)
  getPriorityTextClass,   // Inline tekst
  getPriorityLabel,       // Nederlandse label
  getPriorityOptions      // Voor dropdowns
} from "@/hooks/usePriorityConfig";
```

