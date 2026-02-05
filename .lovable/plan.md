

# Audit: Filter & Sorteer Consistentie Alle Views

## Bevindingen Overzicht

Na grondige analyse van alle dashboard-componenten zijn de volgende punten geïdentificeerd:

---

## ✅ Al Correct Geïmplementeerd

### 1. "Mijn taken / Alle taken" Toggle
| Component | Toggle Aanwezig | Globale State | Status |
|-----------|-----------------|---------------|--------|
| EmbeddedListView | ✅ | ✅ localStorage sync | OK |
| EmbeddedCalendarView | ✅ | ✅ localStorage sync | OK |
| EmbeddedOpvolgingView | ✅ | ✅ localStorage sync | OK |
| MyTasksFlowSection | N.v.t. | N.v.t. (altijd persoonlijk) | OK |

### 2. Groepering op Datum (EmbeddedListView)
| Aspect | Status |
|--------|--------|
| Chronologische sortering groepen | ✅ Geïmplementeerd |
| Taken binnen groep gesorteerd | ✅ Geïmplementeerd |
| "Ongegroepeerd" laatst | ✅ Geïmplementeerd |

---

## ⚠️ Inconsistentie Gevonden: Prioriteit Ranking

Er zijn **twee verschillende prioriteit rankings** in gebruik door de applicatie:

### Ranking A (Nieuwer - "Urgentie eerst")
```text
CRITICAL = 0  ← Hoogste prioriteit
HIGH     = 1
MEDIUM   = 2
LOW      = 3  ← Laagste prioriteit
```
**Gebruikt in:**
- `EmbeddedListView.tsx` (groupBy prioriteit)
- `useTaskListData.ts` (centrale hook)

### Ranking B (Ouder - "Score-gebaseerd")
```text
CRITICAL = 4  ← Hoogste score
HIGH     = 3
MEDIUM   = 2
LOW      = 1  ← Laagste score
```
**Gebruikt in:**
- `MyTasksFlowSection.tsx`
- `Kanban.tsx`

### Impact
Wanneer een gebruiker sorteert op prioriteit:
- In **Lijstweergave**: "ascending" toont CRITICAL → LOW
- In **Mijn Werk (Flow)**: "ascending" toont LOW → CRITICAL

Dit is **verwarrend** voor gebruikers die verwachten dat "oplopend" consistent gedrag heeft.

---

## Aanbevolen Oplossing

### Stap 1: Centrale Prioriteit Constante Maken

Maak één shared constante voor prioriteit ranking die overal gebruikt wordt:

```text
// src/lib/constants/priorities.ts (nieuw bestand)
export const PRIORITY_ORDER = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3
} as const;

// Sorteervolgorde: ascending = meest urgent eerst (CRITICAL → LOW)
```

### Stap 2: Bestanden Updaten

| Bestand | Wijziging |
|---------|-----------|
| `src/components/dashboard/MyTasksFlowSection.tsx` | Vervang lokale `priorityRank` met import |
| `src/pages/Kanban.tsx` | Vervang lokale `priorityRank` met import |
| `src/components/TaskListView/hooks/useTaskListData.ts` | Gebruik centrale import |
| `src/components/dashboard/EmbeddedListView.tsx` | Gebruik centrale import (in groupedTasks) |

### Stap 3: Sorteerlogica Unified

Alle sorteerlogica voor prioriteit moet identiek werken:
- `asc` (oplopend) = Meest urgent eerst (CRITICAL → HIGH → MEDIUM → LOW)
- `desc` (aflopend) = Minst urgent eerst (LOW → MEDIUM → HIGH → CRITICAL)

---

## Andere Filters: Geen Issues Gevonden

### EmbeddedOpvolgingView
- Sorteert op AI-score (priorityScore) aflopend
- Geen handmatige sorteer-opties voor gebruiker
- Werkt correct met gefilterde taken

### EmbeddedCalendarView
- Sorteert op start_at datum (database niveau)
- Geen groepeer-opties (kalender is de groepering)
- Werkt correct

### EmbeddedListView
- Kolom-sortering werkt correct (start_at, due_at, priority)
- Zoekfunctie werkt correct
- Status filter werkt correct

---

## Implementatie Samenvatting

| Taak | Prioriteit | Risico |
|------|------------|--------|
| Centrale prioriteit constante maken | Hoog | Laag |
| MyTasksFlowSection updaten | Hoog | Laag |
| Kanban.tsx updaten | Hoog | Laag |
| Overige bestanden uniformeren | Medium | Laag |

### Verwachte Resultaat

Na deze wijzigingen:
1. **Consistent gedrag**: Prioriteit sortering werkt identiek in alle views
2. **Voorspelbaar voor gebruikers**: "Oplopend" betekent altijd urgent eerst
3. **Makkelijker onderhoud**: Eén plek om prioriteit ranking te wijzigen

---

## Technische Details

### Nieuw Bestand: `src/lib/constants/priorities.ts`

```text
// Prioriteit volgorde voor sortering
// Lager nummer = hogere urgentie = verschijnt eerst bij "ascending" sort
export const PRIORITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3
} as const;

// Labels voor weergave
export const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: 'Kritiek',
  HIGH: 'Hoog',
  MEDIUM: 'Gemiddeld',
  LOW: 'Laag'
} as const;
```

### Wijziging MyTasksFlowSection.tsx

```text
// VERWIJDER:
const priorityRank: Record<string, number> = {
  'CRITICAL': 4,
  'HIGH': 3,
  'MEDIUM': 2,
  'LOW': 1,
};

// VERVANG MET:
import { PRIORITY_ORDER } from '@/lib/constants/priorities';

// In sorteerlogica:
const rankA = PRIORITY_ORDER[a.priority] ?? 4;
const rankB = PRIORITY_ORDER[b.priority] ?? 4;
return sortDirection === 'asc' ? rankA - rankB : rankB - rankA;
```

### Wijziging Kanban.tsx

Identieke wijziging als MyTasksFlowSection.

---

## Risico Analyse

| Risico | Kans | Impact | Mitigatie |
|--------|------|--------|-----------|
| Breaking change sorteer UX | Laag | Medium | Duidelijke documentatie |
| Gebruikers verward door nieuwe volgorde | Medium | Laag | Consistent gedrag is beter op lange termijn |
| Regressie in andere views | Laag | Medium | Unit tests toevoegen |

