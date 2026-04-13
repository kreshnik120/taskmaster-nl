

# Bevindingen: Dashboard Cleanup Audit

## 1 Kritieke Bug: Dynamische Tailwind-klassen werken NIET

**Ernst: HOOG** — De tab-triggers hebben geen actieve styling (achtergrondkleur, tekstkleur, shadow).

In `UnifiedDashboard.tsx` regels 189-199 worden template literals gebruikt:
```
`bg-tab-${colorKey}-100 dark:bg-tab-${colorKey}-900/50`
`text-tab-${colorKey}-700 dark:text-tab-${colorKey}-300`
`shadow-tab-${colorKey}`
```
En regel 199:
```
`bg-tab-${colorKey}-500`
```

Tailwind JIT kan dynamische klassen **niet** detecteren. De `safelist` is leeg. Dit betekent dat actieve tabs geen achtergrond, tekstkleur of indicator-lijn krijgen.

**Fix**: Gebruik de bestaande statische klassen uit `getTabColors()`:
```typescript
activeTab === value && [
  getTabColors(colorKey).background,  // statisch: "bg-tab-kalender-100 dark:bg-tab-kalender-900/50"
  getTabColors(colorKey).accent,      // statisch: "text-tab-kalender-700 dark:text-tab-kalender-300"
  getTabColors(colorKey).shadow,      // statisch: "shadow-tab-kalender"
]
```
En voor de indicator-lijn:
```typescript
<span className={cn("absolute -bottom-[1px] left-2 right-2 h-[3px] rounded-full shadow-[0_2px_8px_currentColor]", getTabColors(colorKey).indicator)} />
```

## 2 Minor: Dode export `DashboardHeader`

`DashboardHeader` wordt nog steeds geëxporteerd vanuit `dashboard-stats/index.ts` maar wordt nergens meer geïmporteerd. Het bestand `DashboardHeader.tsx` is nu dode code.

**Fix**: Verwijder de export uit `index.ts` en verwijder `DashboardHeader.tsx`.

## 3 Minor: Lege regels / unused import cleanup

Regel 48-49 bevat dubbele lege regels. Verder zijn alle imports correct en worden ze gebruikt.

## Samenvatting

| # | Ernst | Probleem | Fix |
|---|-------|----------|-----|
| 1 | **HOOG** | Dynamische Tailwind-klassen breken tab-styling | Vervang template literals door `getTabColors()` statische klassen |
| 2 | Laag | Dode `DashboardHeader` export + bestand | Verwijder |
| 3 | Cosmetisch | Dubbele lege regels | Opruimen |

De rest van de cleanup (StatCards → KPICard, lege states, Progress indicatorClassName) is correct geïmplementeerd en functioneel.

