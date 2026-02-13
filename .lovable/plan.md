
# NAV-1 -- Navigatie Herstructurering + Planning Tabs

## Overzicht
Enterprise navigatie herstructurering: sidebar hergroeperen in 6 logische blokken, Beschikbaarheid wordt een tab binnen Planning, en de Dashboard Recruitment tab wordt verwijderd. Geen nieuwe features, geen styling -- alleen structuurwijzigingen.

## Wijziging 1 -- AppSidebar.tsx: menuGroups herstructureren

**Bestand:** `src/components/AppSidebar.tsx`

- **Regel 1:** Verwijder `CalendarCheck2` uit de lucide-react import (niet meer nodig als sidebar icon)
- **Regels 35-133:** Vervang de hele `menuGroups` array door 6 nieuwe groepen:
  1. **Overzicht** (defaultOpen: true) -- Dashboard
  2. **Recruitment** (defaultOpen: true) -- Sollicitaties, Professionals, Klanten, Plaatsingen
  3. **Planning & Rooster** (defaultOpen: true) -- Planning, Tijdregistratie
  4. **Facturatie** (defaultOpen: false) -- Facturatie
  5. **Communicatie & Docs** (defaultOpen: false) -- WhatsApp, Bijlagen, Notulen
  6. **Beheer** (defaultOpen: false) -- AI Training, Gebruikers, Afgerond, Verwijderd, Archief
- **Regels 222-227:** Update `openGroups` state naar de 6 nieuwe groep labels

Beschikbaarheid verdwijnt als apart sidebar item (wordt tab in Planning).

## Wijziging 2 -- Planning.tsx: Beschikbaarheid als tab

**Bestand:** `src/pages/Planning.tsx`

- **Imports toevoegen:** `lazy`, `Suspense` uit react; `CalendarCheck2`, `Loader2` uit lucide-react; `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` uit ui/tabs
- **Lazy import:** `const BeschikbaarheidContent = lazy(() => import("@/pages/Beschikbaarheid"));`
- **URL param:** `const activeTab = searchParams.get("tab") || "diensten";` + `handleTabChange` callback
- **Return structuur:** Wrap alle bestaande content in `<Tabs>` met twee tabs:
  - **Diensten** tab: bevat alle bestaande Planning content (KPI's, toggles, toolbar, legenda, kalender, sheets, modals)
  - **Beschikbaarheid** tab: lazy-loaded `<BeschikbaarheidContent />` met Suspense fallback
- Week URL param wordt automatisch gedeeld tussen beide tabs

## Wijziging 3 -- App.tsx: Beschikbaarheid redirect

**Bestand:** `src/App.tsx`

- Verwijder `import Beschikbaarheid from "./pages/Beschikbaarheid"` (regel 30)
- Vervang de `/beschikbaarheid` route door een redirect: `<Navigate to="/planning?tab=beschikbaarheid" replace />`

## Wijziging 4 -- ChatWidget.tsx: PAGE_CONTEXTS merge

**Bestand:** `src/components/AIAssistant/ChatWidget.tsx`

- **Verwijder** de hele `/beschikbaarheid` entry uit PAGE_CONTEXTS (regels 173-182)
- **Update** de `/planning` entry (regels 163-172): voeg beschikbaarheid info toe aan description en voeg een "Beschikbaarheid check" quick action toe met CalendarCheck2 icon
- **Voeg enrichment toe** (na regel 308): detecteer `tab=beschikbaarheid` URL param en voeg " De gebruiker bekijkt de Beschikbaarheid tab." toe aan de context description

## Wijziging 5 -- UnifiedDashboard.tsx: Recruitment tab verwijderen

**Bestand:** `src/pages/UnifiedDashboard.tsx`

- **Regel 19:** Verwijder `'recruitment': 'rose'` uit TAB_CONTEXT_MAP
- **Regels 279-296:** Verwijder de hele Recruitment TabsTrigger
- **Regels 377-385:** Verwijder de hele Recruitment TabsContent
- **Regel 183:** Wijzig grid van `grid-cols-3 md:grid-cols-6` naar `grid-cols-3 md:grid-cols-5`
- Behoud RecruitmentKPIs en UrgencyActionPanel imports (hergebruik later)

## Gewijzigde Bestanden

1. `src/components/AppSidebar.tsx` -- sidebar hergroepering (6 blokken)
2. `src/pages/Planning.tsx` -- Tabs wrapper (Diensten + Beschikbaarheid)
3. `src/App.tsx` -- /beschikbaarheid redirect, import verwijderd
4. `src/components/AIAssistant/ChatWidget.tsx` -- PAGE_CONTEXTS merge
5. `src/pages/UnifiedDashboard.tsx` -- Recruitment tab verwijderd

## Verificatie

- Sidebar toont 6 groepen, geen "Beschikbaarheid" als apart item
- /planning toont twee tabs: Diensten en Beschikbaarheid
- /beschikbaarheid redirect naar /planning?tab=beschikbaarheid
- Dashboard heeft 5 tabs (geen Recruitment)
- Week navigatie gedeeld tussen Diensten en Beschikbaarheid tabs
- ChatWidget context op /planning bevat beschikbaarheid info
