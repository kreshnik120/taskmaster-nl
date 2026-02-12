
# 6 Gerichte Fixes — Planning Module

## Fix 1: Edit modus cascade selects tonen en vullen (NieuweDienstModal.tsx)

**Stap 1 — Edit useEffect: orgId populeren (regel 112-132)**
Na regel 131 (`setSublocationId`), voeg orgId lookup toe op basis van org name match met orgs array. Voeg `orgs` toe aan dependency array.

**Stap 2 — Nieuw useEffect: locationId ophalen (na regel 132)**
Voeg useEffect toe die `location_id` ophaalt uit `client_sublocations` zodra edit mode actief is en locations geladen zijn. Voorkomt dat locationId leeg blijft.

**Stap 3 — Wrapper verwijderen (regel 259 + 293)**
Verwijder `{!isEdit && (` op regel 259 en bijbehorende `)}` op regel 293. Cascade selects worden altijd getoond.

---

## Fix 2: Concept toevoegen aan openDiensten stat (useDienstenPlanning.ts)

**Regel 212-214:** Voeg `"concept"` toe aan het status filter array zodat de KPI "Open diensten" overeenkomt met het aantal kaarten in de "Openstaand" sectie.

---

## Fix 3: Organisaties zonder org_id uit dropdown filteren (PlanningFilters.tsx)

**Regel 173-175:** Filter `orgs` array met `.filter((o) => o.org_id)` en gebruik `value={o.org_id!}` zodat er nooit een fallback naar `o.id` plaatsvindt.

---

## Fix 4: 300ms debounce op professional zoek-input (ToewijzingenBeheer.tsx)

**Stap 1:** Voeg `useEffect` toe aan import (regel 1).
**Stap 2:** Voeg `debouncedSearch` state + useEffect timer toe na bestaande state declarations.
**Stap 3:** Vervang `search` door `debouncedSearch` in queryKey, ilike filter, en enabled conditie. Enabled wordt `searchOpen && debouncedSearch.length > 0`.

---

## Fix 5: splitByStatus importeren i.p.v. dupliceren (PlanningWeekKalender.tsx)

**Stap 1:** Verwijder lokale `splitByStatus` functie (regels 21-26).
**Stap 2:** Wijzig import op regel 7 naar `import { splitByStatus, type DienstData } from "@/hooks/useDienstenPlanning"`.

---

## Fix 6: Herhaling errors tonen via toast (NieuweDienstModal.tsx)

**Regel 228:** Na `console.error` een `toast.error` toevoegen met info over mislukte herhalingen.

---

## Technisch Overzicht

| Bestand | Fix |
|---------|-----|
| NieuweDienstModal.tsx | Fix 1 + 6 |
| useDienstenPlanning.ts | Fix 2 |
| PlanningFilters.tsx | Fix 3 |
| ToewijzingenBeheer.tsx | Fix 4 |
| PlanningWeekKalender.tsx | Fix 5 |

Totaal: 5 bestanden, 6 fixes.
