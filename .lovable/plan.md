

# FIX-UREN-1: Uren weergave matchen met Bendy

## Probleem
Bendy telt uren × posities (1213.92). abcito toont `SUM(netto_uren)` = 1131.3. Het verschil (~83 uur) komt doordat diensten met `gevraagd_aantal > 1` slechts één keer meetellen.

## Wijzigingen (2 plekken)

### 1. `src/hooks/useDienstenPlanning.ts` — regel 239
Stats berekening voor het dashboard.

**Was:** `sum + (d.netto_uren || 0)`
**Wordt:** `sum + (d.netto_uren || 0) * (d.gevraagd_aantal || 1)`

### 2. `src/components/planning/PlanningWeekKalender.tsx` — regel 103
Uren-subtotaal bij "Ingeplande diensten" sectie.

**Was:** `s + (d.netto_uren || 0)`
**Wordt:** `s + (d.netto_uren || 0) * (d.gevraagd_aantal || 1)`

## Niet aanraken
- `DienstCard.tsx` / `DienstDetailSheet.tsx` / `PlanningLijstWeergave.tsx` — daar is `netto_uren` per individuele dienst correct
- De `netto_uren` kolom zelf (GENERATED)
- De sync code

## Verificatie
Na fix: dashboard toont ≈1221 uur voor week 23-29 maart (dicht bij Bendy's 1213.92).

