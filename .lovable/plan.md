

# Beschikbaarheid: Database + Hook + Routing + Sidebar

## Overzicht
Bouw het fundament voor de Beschikbaarheid module: ontbrekende database kolommen toevoegen, een data hook aanmaken, routing configureren, sidebar menu-item toevoegen, en een placeholder pagina met KPI cards neerzetten.

## Stap 1: Database Migratie

De tabel `professional_availability` bestaat al. De migratie voegt toe:

```sql
-- A. Notities kolom
ALTER TABLE professional_availability ADD COLUMN IF NOT EXISTS opmerking TEXT;

-- B. Updated_at + trigger (hergebruikt bestaande update_updated_at_column functie)
ALTER TABLE professional_availability ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE TRIGGER update_professional_availability_updated_at
  BEFORE UPDATE ON professional_availability
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- C. Composite index voor week-queries
CREATE INDEX IF NOT EXISTS idx_pa_professional_date ON professional_availability(professional_id, date);

-- D. Realtime inschakelen
ALTER PUBLICATION supabase_realtime ADD TABLE professional_availability;
```

## Stap 2: Hook -- useBeschikbaarheid.ts

Nieuw bestand `src/hooks/useBeschikbaarheid.ts` met:

- **Interfaces**: `BeschikbaarheidFilters`, `AvailabilityEntry`, `ProfessionalBeschikbaarheid`, `BeschikbaarheidStats`
- **Query 1**: Professionals ophalen (actief/beschikbaar) met client-side filters (functieNiveau, werkvorm, status, regio)
- **Query 2**: Beschikbaarheid entries voor de weekrange (gte/lte op date)
- **Combinatie**: `useMemo` die professionals koppelt aan hun availability entries
- **Stats**: Berekening van totaalProfessionals, beschikbaarVandaag, onbekend, dekkingsgraad
- **Realtime**: Twee `useRealtimeChannel` subscriptions (professional_availability + professionals)
- Volgt exact het patroon van `useDienstenPlanning.ts`

## Stap 3: Routing -- App.tsx

- Import `Beschikbaarheid` pagina toevoegen
- Route `/beschikbaarheid` toevoegen na `/planning` en voor `/gebruikers`

## Stap 4: Sidebar -- AppSidebar.tsx

- `CalendarCheck2` toevoegen aan lucide-react import
- Menu-item "Beschikbaarheid" toevoegen in de Recruitment groep, na Planning en voor Facturatie
- `requiresEdit: true` (zelfde als andere recruitment items)

## Stap 5: Placeholder Pagina -- Beschikbaarheid.tsx

Nieuw bestand `src/pages/Beschikbaarheid.tsx`:

- `PageContainer` met `contextColor="teal"`
- `PageHero` met CalendarCheck2 icoon, titel "Beschikbaarheid", subtitle
- 4 KPI Cards in een grid:
  - Totaal Professionals (teal)
  - Beschikbaar Vandaag (teal)
  - Onbekend (amber)
  - Dekkingsgraad (emerald, met % suffix)
- Placeholder content blokken voor weekkalender en professional lijst (worden in B-2 uitgebouwd)
- Week-parameter in URL via `useSearchParams`

## Gewijzigde Bestanden
1. Database migratie (nieuw) -- opmerking, updated_at, index, realtime
2. `src/hooks/useBeschikbaarheid.ts` (nieuw) -- data hook
3. `src/pages/Beschikbaarheid.tsx` (nieuw) -- placeholder pagina
4. `src/App.tsx` -- route toevoegen
5. `src/components/AppSidebar.tsx` -- menu-item toevoegen
