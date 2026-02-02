
# EXPERT REVIEW RAPPORT: Onderdeel 1 Status & Onderdeel 2 Plan

## STATUS ONDERDEEL 1: VOLLEDIG CORRECT GEIMPLEMENTEERD

### Verificatie Checklist

| Aspect | Status | Bewijs |
|--------|--------|--------|
| 6 gelijkwaardige tabs | Correct | Regels 131-155: TabsTrigger voor alle 6 tabs |
| TabsList grid | Correct | Regel 130: `grid grid-cols-3 md:grid-cols-6` |
| Sub-navigatie verwijderd | Correct | Geen `SUB_VIEWS`, `MijnWerkView`, of `handleViewChange` |
| URL structuur | Correct | `?tab=lijst`, `?tab=kalender`, `?tab=opvolging` |
| Placeholders aanwezig | Correct | Regels 219-250: 3 placeholder TabsContent |
| Mijn Werk vereenvoudigd | Correct | Regels 158-166: Directe content zonder conditionals |

### Geen Problemen Gevonden

Onderdeel 1 is 100% correct uitgevoerd en klaar voor productie.

---

## ONDERDEEL 2: EMBEDDED VIEWS IMPLEMENTEREN

### Analyse Bronbestanden

| Bestand | Regels | Auth Check | Page Header | Complexiteit |
|---------|--------|------------|-------------|--------------|
| Lijst.tsx | 1490 | Ja (regel 183-191) | Ja (regel 817-823) | Hoog |
| Kalender.tsx | 1225 | Ja (regel 319-325) | Ja (regel 803-810) | Hoog |
| Opvolging.tsx | 553 | Ja (regel 70-75) | Ja (regel 250-271) | Medium |

### Implementatiestrategie

We maken 3 nieuwe embedded componenten die de functionaliteit HERGEBRUIKEN van de originele pagina's. Twee opties:

**Optie A - Refactor naar componenten (aanbevolen)**
Maak wrapper componenten die de logica van originele pagina's extraheren zonder dubbele code.

**Optie B - Copy met modificaties**
Kopieer en pas aan. Meer code duplicatie maar sneller.

We kiezen **Optie A** voor onderhoud en consistentie.

---

### Te Maken Bestanden

```text
src/components/dashboard/
├── EmbeddedListView.tsx      (nieuw)
├── EmbeddedCalendarView.tsx  (nieuw)
├── EmbeddedOpvolgingView.tsx (nieuw)
└── ... (bestaande bestanden)
```

### Per Component - Wat Verandert

#### 1. EmbeddedListView.tsx

**Bronbestand:** `src/pages/Lijst.tsx` (1490 regels)

**Te verwijderen/aanpassen:**
- Auth check (regel 183-191) - Dashboard regelt dit al
- Hero section met greeting (regel 809-823)
- `useNavigate` redirect naar `/auth`

**Te behouden:**
- Alle state management
- Real-time subscriptions
- Filters, sorting, grouping
- Bulk actions
- Keyboard shortcuts
- Subtask handling
- KPI cards
- Table met alle functionaliteit

**Aanpassing nodig:**
```typescript
// Van:
if (!session) {
  navigate("/auth");
}

// Naar:
// Verwijderd - Dashboard handelt auth af
```

**Hero aanpassing:**
```typescript
// Van:
<h1 className="text-5xl font-bold mb-1">
  {getGreeting()}, {user?.user_metadata?.name}
</h1>

// Naar:
// Verwijderd - geen page-level header nodig in tab
```

---

#### 2. EmbeddedCalendarView.tsx

**Bronbestand:** `src/pages/Kalender.tsx` (1225 regels)

**Te verwijderen/aanpassen:**
- Auth check (regel 319-325)
- Page header (regel 803-810)

**Te behouden:**
- Week navigatie
- Drag & drop functionaliteit
- Reminders
- View mode toggle (5/7 dagen)
- KPI cards
- Filter toggle (Mijn taken / Alle taken)

---

#### 3. EmbeddedOpvolgingView.tsx

**Bronbestand:** `src/pages/Opvolging.tsx` (553 regels)

**Te verwijderen/aanpassen:**
- Auth check (regel 70-75)
- Page header met "Opvolging" titel (regel 250-271)

**Te behouden:**
- AI scoring met `useAiScoring` hook
- KPI cards
- Focus taken lijst
- Filter functionaliteit
- Completion handlers met confetti

---

### UnifiedDashboard.tsx Wijzigingen

#### Imports Toevoegen

```typescript
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

// Lazy load embedded views
const EmbeddedListView = lazy(() => import("@/components/dashboard/EmbeddedListView"));
const EmbeddedCalendarView = lazy(() => import("@/components/dashboard/EmbeddedCalendarView"));
const EmbeddedOpvolgingView = lazy(() => import("@/components/dashboard/EmbeddedOpvolgingView"));
```

#### Loading Fallback Component

```typescript
const TabLoadingFallback = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);
```

#### Placeholders Vervangen

```typescript
{/* Tab 4: Lijst */}
<TabsContent value="lijst" className="space-y-6 mt-6">
  <Suspense fallback={<TabLoadingFallback />}>
    <EmbeddedListView />
  </Suspense>
</TabsContent>

{/* Tab 5: Kalender */}
<TabsContent value="kalender" className="space-y-6 mt-6">
  <Suspense fallback={<TabLoadingFallback />}>
    <EmbeddedCalendarView />
  </Suspense>
</TabsContent>

{/* Tab 6: Opvolging */}
<TabsContent value="opvolging" className="space-y-6 mt-6">
  <Suspense fallback={<TabLoadingFallback />}>
    <EmbeddedOpvolgingView />
  </Suspense>
</TabsContent>
```

---

### Voordelen van Lazy Loading

| Aspect | Voordeel |
|--------|----------|
| Bundle Size | Alleen laden wat nodig is |
| Initiële Load | Dashboard laadt sneller |
| Memory | Ongebruikte tabs laden niet |
| UX | Smooth loading indicator per tab |

---

### Risico's en Mitigatie

| Risico | Mitigatie |
|--------|-----------|
| State verlies bij tab switch | Geen probleem - elke tab beheert eigen state |
| Real-time channels dupliceren | Gebruik unieke channel names |
| URL params conflicten | Lijstview gebruikt geen URL params in embedded mode |
| Keyboard shortcuts overlap | Scopen naar actieve tab |

---

### Testprotocol Onderdeel 2

| Test | Verwacht Resultaat |
|------|-------------------|
| Klik Lijst tab | Volledige tabel met taken, filters, sorting |
| Klik Kalender tab | Week view met drag-drop |
| Klik Opvolging tab | AI scoring, top 10 focus taken |
| Switch tussen tabs | Geen errors, smooth transitions |
| Real-time updates | Nieuwe taken verschijnen in elke tab |
| Keyboard shortcuts | Werken alleen in actieve tab |
| Mobile responsive | Alle 3 views werken op mobile |

---

### Implementatie Volgorde

1. **EmbeddedOpvolgingView.tsx** (kleinste: ~500 regels)
   - Eenvoudigste om te testen
   - Valideer patroon werkt

2. **EmbeddedCalendarView.tsx** (medium: ~1150 regels)
   - Complexere drag-drop
   - Week navigatie

3. **EmbeddedListView.tsx** (grootste: ~1400 regels)
   - Meeste functionaliteit
   - Bulk actions, keyboard shortcuts

4. **UnifiedDashboard.tsx updaten**
   - Imports toevoegen
   - Placeholders vervangen met Suspense

---

### Tijdsinschatting

| Stap | Tijd |
|------|------|
| EmbeddedOpvolgingView | 10 min |
| EmbeddedCalendarView | 15 min |
| EmbeddedListView | 15 min |
| Dashboard updates | 5 min |
| Testing | 10 min |
| **Totaal** | **~55 min** |

---

## KLAAR VOOR UITVOERING

Na goedkeuring start ik met:
1. EmbeddedOpvolgingView.tsx maken
2. EmbeddedCalendarView.tsx maken
3. EmbeddedListView.tsx maken
4. UnifiedDashboard.tsx updaten met lazy imports
