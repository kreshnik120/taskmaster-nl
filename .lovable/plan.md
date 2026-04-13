

# Dashboard Strakker & Cleaner — Verbeterplan

## Bevindingen

Na visuele inspectie en code-analyse zijn dit de punten die strakker en cleaner kunnen:

### 1. Dubbele header op Team-tab
De Team-tab toont **twee headers**: de pagina-header ("Dashboard / Team") EN de `DashboardHeader` component ("Overzicht / Team statistieken en voortgang" + Vernieuwen-knop). Dit is redundant en verspilt verticale ruimte.

**Fix**: Verwijder de `DashboardHeader` component uit de Team-tab. Verplaats de "Vernieuwen"-knop naar de pagina-header (rechtsboven, naast de tabs).

### 2. TabsTrigger-code is 5x herhaald
Elke tab-trigger (Mijn Werk, Kalender, Lijst, Opvolging, Team) heeft ~15 regels vrijwel identieke code met alleen de naam/icoon/kleur anders. Dit maakt de component onnodig lang (400 regels).

**Fix**: Maak een `tabConfig`-array en render de triggers met `.map()`. Reduceert ~75 regels naar ~20.

### 3. Mijn Werk: TodayFocus + Reminders nemen halve pagina in
De twee cards (TodayFocusCard + UpcomingRemindersWidget) staan in een 2-kolom grid en nemen veel ruimte in, terwijl de data vaak minimaal is (loading states, lege lijsten). De view-toggle (Bord/Weekkalender) staat los eronder.

**Fix**: Combineer de focus-items en view-toggle in een compacte toolbar-achtige rij bovenaan. TodayFocus wordt een inline samenvattingsregel i.p.v. een volledige card. Reminders worden een collapsible badge-trigger.

### 4. StatCards inconsistente styling
De 4 KPI-kaarten op Team gebruiken de `StatCard` component met `glass-liquid-card` classes, maar de kaarten op andere pagina's (Recruitment, Facturatie) gebruiken de `KPICard` component. Twee verschillende KPI-systemen.

**Fix**: Migreer `StatCards` naar de bestaande `KPICard`-component met `variant="violet"` (Team-context). Eén consistent KPI-systeem.

### 5. Lege secties nemen te veel ruimte in
"Verlopen Taken" en "Komende Week" tonen volledige Card-containers met headers, zelfs als ze leeg zijn ("Geen verlopen taken", "Geen taken gepland"). Dit verspilt ruimte.

**Fix**: Lege secties tonen als compacte inline-meldingen (geen volledige Card) of worden verborgen met een subtle indicator.

### 6. Progress bars blauw i.p.v. context-kleur
De voortgangsbalken in Per Medewerker en Per Bron zijn standaard blauw (`<Progress>`), terwijl de Team-tab violet als context-kleur heeft.

**Fix**: Geef de `Progress`-component een violet kleur via `className` of een `indicatorClassName` prop die past bij de glass-card-violet context.

## Implementatieplan

| # | Wijziging | Bestanden |
|---|-----------|-----------|
| 1 | Dubbele header verwijderen, Vernieuwen-knop naar pagina-header | `UnifiedDashboard.tsx`, verwijder `DashboardHeader` uit Team-tab |
| 2 | TabsTrigger refactoren naar map-loop | `UnifiedDashboard.tsx` |
| 3 | TodayFocus + Reminders compacter maken als toolbar | `UnifiedDashboard.tsx`, `TodayFocusCard.tsx` |
| 4 | StatCards migreren naar KPICard-component | `UnifiedDashboard.tsx`, mogelijk `StatCards.tsx` verwijderen |
| 5 | Lege secties compacter renderen | `OverdueTasksList.tsx`, `UpcomingTasksList.tsx` |
| 6 | Progress bars context-kleur geven | `AssigneeProgress.tsx`, `SourceProgress.tsx` |

Geen database-wijzigingen nodig. Puur UI/UX cleanup.

