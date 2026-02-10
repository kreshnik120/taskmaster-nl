
# "Mijn Werk" View Toggle: Bord + Weekkalender

## Overzicht

Een view toggle toevoegen aan de "Mijn Werk" tab zodat gebruikers kunnen wisselen tussen het Kanban-bord (MyTasksFlowSection) en de Weekkalender (MyWeekCalendarSection). De keuze wordt opgeslagen in localStorage.

---

## Wijzigingen

### Enig bestand: `src/pages/UnifiedDashboard.tsx`

**Imports toevoegen:**
- `LayoutGrid` uit `lucide-react`
- `{ ToggleGroup, ToggleGroupItem }` uit `@/components/ui/toggle-group`
- `{ MyTasksFlowSection }` uit `@/components/dashboard/MyTasksFlowSection` (direct import, niet lazy)

**State toevoegen (regel ~72):**
```
const [mijnWerkView, setMijnWerkView] = useState<"bord" | "kalender">(
  () => (localStorage.getItem("mijn-werk-view") as "bord" | "kalender") || "bord"
);
```

**Handler toevoegen:**
```
const handleViewChange = (view: string) => {
  if (view === "bord" || view === "kalender") {
    setMijnWerkView(view);
    localStorage.setItem("mijn-werk-view", view);
  }
};
```

**TabsContent "mijn-werk" aanpassen (regels 286-298):**

Tussen de widget grid en de content, een view toggle bar invoegen met een ToggleGroup (Bord / Weekkalender). Daaronder conditioneel MyTasksFlowSection of MyWeekCalendarSection renderen:

- "Bord" knop: LayoutGrid icon + tekst
- "Weekkalender" knop: Calendar icon + tekst
- Bord = `<MyTasksFlowSection />` (direct)
- Weekkalender = `<Suspense><MyWeekCalendarSection /></Suspense>` (lazy)

### Wat NIET verandert

- MyTasksFlowSection.tsx: ongewijzigd
- MyWeekCalendarSection.tsx: ongewijzigd
- Andere tabs: ongewijzigd
- Geen database wijzigingen
