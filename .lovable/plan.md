
# 4 Kritieke Fixes — Planning Module

## Fix 1: Verwijder `netto_uren` uit INSERT (NieuweDienstModal.tsx)
Verwijder regel 204 (`netto_uren: duur,`) uit het `dienstData` object. De database berekent dit automatisch via een GENERATED column. De `duur` variabele blijft bestaan voor de live preview.

## Fix 2: Timezone-fix weekkalender (PlanningWeekKalender.tsx)
Regel 95: `new Date(weekStart)` wordt `parseISO(weekStart)`. Import is al aanwezig op regel 2.

## Fix 3: Timezone-fix toolbar (PlanningToolbar.tsx)
Regel 3: voeg `parseISO` toe aan de date-fns import. Regel 19: `new Date(weekStart)` wordt `parseISO(weekStart)`.

## Fix 4: Timezone-fix edit datum (NieuweDienstModal.tsx)
Regel 2: voeg `parseISO` toe aan de date-fns import. Regel 115: `new Date(editDienst.datum)` wordt `parseISO(editDienst.datum)`.

## Technisch overzicht

| # | Bestand | Regel(s) | Wijziging |
|---|---------|----------|-----------|
| 1 | NieuweDienstModal.tsx | 204 | Verwijder `netto_uren: duur,` |
| 2 | PlanningWeekKalender.tsx | 95 | `parseISO(weekStart)` |
| 3 | PlanningToolbar.tsx | 3, 19 | Import + `parseISO(weekStart)` |
| 4 | NieuweDienstModal.tsx | 2, 115 | Import + `parseISO(editDienst.datum)` |

Totaal: 3 bestanden, 4 minimale wijzigingen.
