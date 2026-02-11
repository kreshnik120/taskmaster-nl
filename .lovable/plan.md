
# Prompt #1A — Database Fundament + Data Hook + Routing

## Overzicht

Fundament voor de Diensten Planning module: 3 database tabellen met RLS + triggers, een data hook, placeholder pagina, routing en sidebar item.

---

## Stap 1: Database Migratie

Een enkele SQL migratie met:

### Tabel 1: `diensten`
- Alle kolommen zoals gespecificeerd (id, org_id, sublocation_id, titel, datum, start/eind_tijd, pauze_minuten, netto_uren als GENERATED column, status/type/herhaling CHECK constraints, etc.)
- FK naar `organizations(id)` en `client_sublocations(id)`
- 5 indexes (datum, org, sublocation, status, datum+status)
- `update_updated_at_column()` trigger (functie bestaat al)
- RLS via `user_organizations` (select/insert/update/delete)
- Realtime enabled

### Tabel 2: `dienst_toewijzingen`
- FK naar `diensten(id) ON DELETE CASCADE` en `professionals(id)`
- UNIQUE(dienst_id, professional_id)
- Status workflow: voorgesteld, positief, misschien, bevestigd, afgewezen, no_show, voltooid
- RLS via dienst -> org keten
- Realtime enabled
- `update_updated_at_column()` trigger

### Tabel 3: `dienst_filter_presets`
- Persoonlijke filter opslag (user_id, naam, filters JSONB)
- RLS: alleen eigen presets (user_id = auth.uid())

### Trigger 1: Overlap Check
- `check_dienst_overlap()` — voorkomt dat een professional twee overlappende diensten heeft (op basis van datum + tijden)
- Wordt uitgevoerd BEFORE INSERT OR UPDATE op `dienst_toewijzingen`

### Trigger 2: Auto Status Update
- `update_dienst_status()` — SECURITY DEFINER functie die automatisch de dienst status bijwerkt op basis van aantal bevestigde/positieve toewijzingen vs. gevraagd_aantal
- Wordt uitgevoerd AFTER INSERT OR UPDATE OR DELETE op `dienst_toewijzingen`
- Beschermt statussen 'concept', 'voltooid', 'geannuleerd' tegen automatische wijziging

---

## Stap 2: Data Hook — `src/hooks/useDienstenPlanning.ts`

Nieuw bestand, volgt het `useFacturen` patroon:

- **Interfaces**: `DienstFilters`, `DienstData`, `PlanningStats` zoals gespecificeerd
- **Query**: TanStack Query met server-side week filtering (`.gte('datum', weekStart).lte('datum', weekEnd)`)
- **Joins**: `client_sublocations` -> `client_locations` -> `client_organizations` + `dienst_toewijzingen` -> `professionals`
- **Client-side filters**: status, bureau (via org name), functieniveau, locatie, werkvorm
- **Stats berekening**: vandaag, dezeWeek, openDiensten, bezettingsgraad, totaalUrenWeek
- **Realtime**: Twee `useRealtimeChannel` subscripties (diensten + dienst_toewijzingen) met 200ms debounce
- **Helper**: `splitByStatus()` functie die diensten splitst in open vs. ingepland
- **Query key**: `["diensten-planning", filters.weekStart, filters]`

---

## Stap 3: Placeholder Pagina — `src/pages/Planning.tsx`

Nieuw bestand met:
- `PageContainer` met `contextColor="rose"`
- `PageHero` met titel "Planning", subtitel "Diensten & roosterbeheer", `CalendarDays` icon
- Minimale placeholder die de hook aanroept met default filters (huidige week)
- Toont laadstatus en aantal gevonden diensten

---

## Stap 4: Routing — `src/App.tsx`

- Import `Planning` van `"./pages/Planning"`
- Route `<Route path="/planning" element={<Planning />} />` na `/plaatsingen`

---

## Stap 5: Sidebar — `src/components/AppSidebar.tsx`

- `CalendarDays` toevoegen aan lucide-react import (regel 1)
- Menu item toevoegen in Recruitment groep, na "Plaatsingen" en voor "Facturatie":

```text
{
  title: "Planning",
  url: "/planning",
  icon: CalendarDays,
  requiresEdit: true
}
```

---

## Technisch Overzicht

| Onderdeel | Bestand | Actie |
|-----------|---------|-------|
| Database | SQL migratie | 3 tabellen + 2 triggers + RLS + indexes + realtime |
| Hook | `src/hooks/useDienstenPlanning.ts` | Nieuw bestand |
| Pagina | `src/pages/Planning.tsx` | Nieuw bestand |
| Routing | `src/App.tsx` | 1 import + 1 route |
| Sidebar | `src/components/AppSidebar.tsx` | 1 icon import + 1 menu item |

Geen UI componenten (kalender, filters, modals) — die komen in prompt #1B.
