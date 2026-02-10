
# KPI Kleuren per Tab + Glass op Platte Pagina's

## Overzicht

Twee problemen worden opgelost: (1) KPI cards gebruiken generieke kleuren i.p.v. tab-specifieke kleuren, en (2) enkele pagina's missen glass styling. Professionals.tsx gebruikt al `variant="violet"` (correct), Klanten.tsx gebruikt al `variant="slate"` (moet rose worden).

---

## DEEL 1: KPI Card Variant Fixes

### EmbeddedCalendarView.tsx (Kalender = teal)
4 wijzigingen:
- Regel 674: `variant="count"` naar `variant="teal"`
- Regel 681: `variant="success"` naar `variant="teal"`
- Regel 688: `variant="time"` naar `variant="teal"`
- Regel 698: `variant="urgent"` naar `variant="teal"`

### EmbeddedListView.tsx (Lijst = slate)
3 wijzigingen:
- Regel 800: `variant="count"` naar `variant="slate"`
- Regel 807: `variant="success"` naar `variant="slate"`
- Regel 814: `variant="urgent"` naar `variant="slate"`

### EmbeddedOpvolgingView.tsx (Opvolging = amber)
4 wijzigingen:
- Regel 275: `variant="urgent"` naar `variant="amber"`
- Regel 283: `variant="time"` naar `variant="amber"`
- Regel 291: `variant="count"` naar `variant="amber"`
- Regel 299: `variant="success"` naar `variant="amber"`

### RecruitmentKPIs.tsx (Recruitment = rose)
4 wijzigingen:
- Regel 63: `variant="count"` naar `variant="rose"`
- Regel 71: `variant="success"` naar `variant="rose"`
- Regel 79: `variant="time"` naar `variant="rose"`
- Regel 87: `variant="urgent"` naar `variant="rose"`

### MyWeekCalendarSection.tsx (Mijn Werk = indigo)
1 wijziging:
- Regel 459: `variant="time"` naar `variant="indigo"`

### Kanban.tsx (Kanban = indigo)
4 wijzigingen:
- Regel 696: `variant="count"` naar `variant="indigo"`
- Regel 711: `variant="time"` naar `variant="indigo"`
- Regel 726: `variant="time"` naar `variant="indigo"`
- Regel 741: `variant="success"` naar `variant="indigo"`

### Klanten.tsx (Klanten = rose)
4 wijzigingen (huidige variant is "slate", moet "rose"):
- Regels 619, 627, 635, 643: `variant="slate"` naar `variant="rose"`

### Facturatie.tsx (Facturatie = emerald)
2 wijzigingen:
- Regel 289: `variant="urgent"` naar `variant="emerald"`
- Regel 298: `variant="success"` naar `variant="emerald"`

### Professionals.tsx - GEEN wijziging nodig
Gebruikt al `variant="violet"` op alle 4 KPIs (correct).

---

## DEEL 2: Glass Styling op Platte Pagina's

### Kanban.tsx - Header bar (regel 755)
Huidige styling: `className="flex items-center justify-between py-4 border-b mb-6"`
Nieuwe styling: `className="flex items-center justify-between p-4 mb-4 glass-layer-1 rounded-xl border border-white/30 dark:border-white/10"`

### Sollicitaties.tsx - Filter area
De filters zitten in een Popover, niet een filter bar. Dit is al correct voor de huidige UI-structuur. Geen wijziging nodig.

### Professionals.tsx en Klanten.tsx
Deze pagina's gebruiken al `PageContainer` met contextColor en `PageHero`. De content cards (ProfessionalCard, OrganizationCard) zijn individuele kaarten die al eigen styling hebben. Het toevoegen van een wrapper glass-liquid-card rond de hele content sectie zou de layout breken. Geen wijziging nodig - de individuele kaarten en PageContainer background zijn voldoende.

---

## Technisch Overzicht

| Bestand | Wijziging |
|---------|-----------|
| `src/components/dashboard/EmbeddedCalendarView.tsx` | 4x variant naar "teal" |
| `src/components/dashboard/EmbeddedListView.tsx` | 3x variant naar "slate" |
| `src/components/dashboard/EmbeddedOpvolgingView.tsx` | 4x variant naar "amber" |
| `src/components/dashboard/RecruitmentKPIs.tsx` | 4x variant naar "rose" |
| `src/components/dashboard/MyWeekCalendarSection.tsx` | 1x variant naar "indigo" |
| `src/pages/Kanban.tsx` | 4x variant naar "indigo" + header glass styling |
| `src/pages/Klanten.tsx` | 4x variant van "slate" naar "rose" |
| `src/pages/Facturatie.tsx` | 2x variant naar "emerald" |

Totaal: 26 variant-wijzigingen + 1 glass styling fix.

## Wat NIET verandert

- Geen functionaliteit, logica of database
- Geen routing
- KPICard component zelf niet gewijzigd
- Professionals.tsx: al correct (violet)
- Sollicitaties.tsx: filters zitten in Popover, geen bar om te stylen
