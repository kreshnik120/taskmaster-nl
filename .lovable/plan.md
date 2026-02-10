
# "Mijn Werk" Tab: Kanban naar Weekkalender

## Overzicht

De MyTasksFlowSection (Kanban met 5 kolommen) wordt vervangen door een MyWeekCalendarSection - een persoonlijke weekkalender die het bewezen patroon van EmbeddedCalendarView hergebruikt, maar uitsluitend eigen taken toont. MyTasksFlowSection.tsx blijft bestaan (niet verwijderd).

---

## Wijzigingen

### 1. Nieuw bestand: `src/components/dashboard/MyWeekCalendarSection.tsx`

Een zelfstandig component (~400 regels) gebaseerd op het EmbeddedCalendarView patroon, met deze aanpassingen:

**Data ophalen:**
- Eigen taken via `supabase.from("tasks").select(...)` met `.eq("assignee_id", user.id)`, `.is("deleted_at", null)`, `.is("completed_at", null)`
- GEEN team-filter toggle (altijd alleen eigen taken)
- GEEN subtasks/reminders (vereenvoudigd t.o.v. EmbeddedCalendarView)
- Taken ZONDER start_at EN zonder due_at komen in de "Ongepland" sectie

**Weekkalender features (overgenomen uit EmbeddedCalendarView):**
- Week navigatie: vorige/volgende knoppen + "Vandaag" link + weeknummer
- 5/7 dagen toggle via ToggleGroup (default "5" = Ma-Vr)
- startOfWeek met `{ locale: nl, weekStartsOn: 1 }`
- Dag kolommen als Card met header (dag + datum + isToday indicator) + plus-knop
- Taken als compacte kaartjes: priority dot + titel (truncated) + tijdstip (HH:mm)
- Empty states per dag (hergebruik van `getEmptyStateMessage` patroon)
- Week progress bar (alleen bij huidige week)

**Drag & drop (hergebruik van EmbeddedCalendarView patronen):**
- DraggableTask wrapper met `useDraggable` + DroppableDay wrapper met `useDroppable`
- PointerSensor met distance: 10 (consistent met EmbeddedCalendarView)
- Bij drop: update start_at en/of due_at naar nieuwe dag (behoud origineel tijdstip)
- Toast: "Taak verplaatst naar [dag naam]"
- DragOverlay met indigo glass theme (i.p.v. teal)

**Ongepland sectie:**
- Collapsible Card onder de weekkalender
- Horizontale scrollbare lijst van compacte taakkaartjes
- Draggable vanuit ongepland naar een dag: zet due_at op die dag 12:00
- Count badge in header

**KPI strip (3 KPICards boven de kalender):**
- "Vandaag" - taken count voor vandaag
- "Deze week" - totaal taken deze week
- "Ongepland" - taken zonder datum
- Gebruik useCountUp voor animatie

**Interacties:**
- Klik op taak: opent TaskDetailModal
- Plus-knop per dag: opent TaskDialog met defaultStartDate
- Realtime: useRealtimeChannel met filter `assignee_id=eq.${user.id}`

**Styling:**
- Glass/indigo tokens (glass-card-indigo, glass-drag-overlay-enhanced)
- Responsive: grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 (of 7)
- date-fns met nl locale

### 2. `src/pages/UnifiedDashboard.tsx`

Minimale wijzigingen:
- Import `MyWeekCalendarSection` (lazy loaded) i.p.v. `MyTasksFlowSection`
- In TabsContent "mijn-werk": vervang `<MyTasksFlowSection />` door `<Suspense><MyWeekCalendarSection /></Suspense>`
- Verwijder de `MyTasksFlowSection` import (het bestand zelf blijft bestaan)

---

## Technisch Overzicht

| Onderdeel | Bestand | Type |
|-----------|---------|------|
| Weekkalender component | `MyWeekCalendarSection.tsx` (nieuw) | Nieuw bestand |
| Dashboard integratie | `UnifiedDashboard.tsx` | Import swap |

## Wat NIET verandert

- MyTasksFlowSection.tsx blijft bestaan (niet verwijderd)
- EmbeddedCalendarView.tsx wordt niet gewijzigd
- TodayFocusCard en UpcomingRemindersWidget blijven boven de kalender
- Geen database wijzigingen
- Andere tabs ongewijzigd
