

# KPI-rij → Dynamische Alert-bar

## Concept

Vervang de 5 KPI-kaarten door een **prioriteitsgestuurde alert-bar** die automatisch het belangrijkste probleem toont. Als dat probleem is opgelost, schuift de volgende alert naar voren. Geen alerts? Geen balk — 0px overhead.

## Prioriteitsvolgorde (hardcoded)

| Prio | Conditie | Bericht | Actie |
|------|----------|---------|-------|
| 1 | `docsExpiredCount > 0` | "⚠ {n} professionals met verlopen documenten" | Filter op docs_verlopen |
| 2 | `availableCount > 20` | "💡 {n} professionals beschikbaar — overweeg actieve matching" | Filter op beschikbaar |
| 3 | `newInLast7Days > 0` | "🆕 {n} nieuwe professionals deze week" | Filter op nieuw |

Alleen de **hoogste actieve alert** wordt getoond. Als er geen alerts zijn, wordt de hele balk niet gerenderd.

## Technisch

**Bestand:** `src/pages/Professionals.tsx`

- Verwijder het hele KPI-grid blok (regels 633-640)
- Verwijder KPI-gerelateerde imports (`KPICard`, ongebruikte iconen)
- Voeg een inline alert-bar toe: een `div` met glass-styling, icoon, tekst, en een "Bekijk →" knop
- De alert-bar gebruikt de bestaande `handleKpiClick()` logica — die blijft intact
- Bestaande metrics (`docsExpiredCount`, `availableCount`, `newInLast7Days`) blijven berekend
- Alert-bar styling: `glass-liquid-card` met amber/rode border-left afhankelijk van urgentie, ~32px hoog

