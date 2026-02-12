
# B-3 -- Cross-Module Integratie (Beschikbaarheid)

## Overzicht
Beschikbaarheid is momenteel een eiland. Deze integratie voegt beschikbaarheidsindicatoren toe aan alle plekken waar planners professionals zien of toewijzen: zoekresultaten, pre-toewijzing, en het professional detail modal.

## Stap 1: useBeschikbaarheidIndicator hook (nieuw)

Nieuw bestand `src/hooks/useBeschikbaarheidIndicator.ts`.

Lichtgewicht hook die beschikbaarheid ophaalt voor 1 specifieke datum. Wordt gebruikt in ToewijzingenBeheer en NieuweDienstModal.

- **Input**: `date: string` (yyyy-MM-dd), `dienstType?: string` (dag/avond/nacht/weekend)
- **Query**: Haalt alle `professional_availability` entries op voor die datum
- **Functie** `getStatus(professionalId)` retourneert `"beschikbaar" | "niet_beschikbaar" | "onbekend"`
- Shift-mapping logica: `dag` checkt shift `dag` en `hele_dag`, `avond` checkt `avond` en `hele_dag`, `nacht` checkt `nacht` en `hele_dag`, `weekend` checkt alle shifts
- Query key: `["beschikbaarheid-indicator", date]`
- `staleTime: 30000` (data verandert niet heel snel)

## Stap 2: useProfessionalWeekBeschikbaarheid hook (nieuw)

Nieuw bestand `src/hooks/useProfessionalWeekBeschikbaarheid.ts`.

Per-professional week data met realtime. Wordt gebruikt in de MiniKalender in ProfessionalDetailModal.

- **Input**: `professionalId: string`, `weekStart: string`
- **Query**: Haalt `professional_availability` entries op voor 1 professional, 1 week
- **Realtime**: `useRealtimeChannel` op `professional_availability` met filter op `professional_id`
- Retourneert `availability: AvailabilityEntry[]`, `isLoading`

## Stap 3: BeschikbaarheidDot component (nieuw)

Nieuw bestand `src/components/beschikbaarheid/BeschikbaarheidDot.tsx`.

Herbruikbare indicator dot met tooltip:

- Props: `status: "beschikbaar" | "niet_beschikbaar" | "onbekend"`, `showLabel?: boolean`, `size?: "sm" | "md"`
- Kleuren: emerald (beschikbaar), rose (niet beschikbaar), slate (onbekend)
- Tooltip met status tekst
- Optioneel tekstlabel naast de dot (bijv. "niet beschikbaar" bij rode dots)
- Compact: `w-2.5 h-2.5` (sm) of `w-3 h-3` (md) rounded-full

## Stap 4: BeschikbaarheidMiniKalender component (nieuw)

Nieuw bestand `src/components/beschikbaarheid/BeschikbaarheidMiniKalender.tsx`.

Compacte weekview voor 1 professional, voor gebruik in ProfessionalDetailModal:

- Props: `professionalId: string`
- Interne state voor `weekStart` met week-navigatie (prev/next/vandaag)
- Hergebruikt `useProfessionalWeekBeschikbaarheid` voor data
- Hergebruikt `useBeschikbaarheidMutations` voor toggle
- Hergebruikt bestaande `BeschikbaarheidCelEditor` voor D/A/N knoppen
- Hergebruikt `BeschikbaarheidLegenda`
- 7-kolommen grid (ma-zo) met D/A/N per dag
- "Volledig overzicht" link naar `/beschikbaarheid`

## Stap 5: ToewijzingenBeheer.tsx aanpassen

In de professional zoekresultaten (CommandItem, regels 291-304):

- Importeer en gebruik `useBeschikbaarheidIndicator` met `dienst.datum` en `dienst.dienst_type`
- Voeg `BeschikbaarheidDot` toe naast elke professional naam in de zoeklijst
- Bij rode dot: extra tekst "niet beschikbaar" voor duidelijkheid

## Stap 6: NieuweDienstModal.tsx aanpassen

In de pre-toewijzing zoekresultaten (regels 799-816):

- Importeer en gebruik `useBeschikbaarheidIndicator` met `datums[0]` (eerste geselecteerde datum) en `dienstType`
- Voeg `BeschikbaarheidDot` toe naast elke professional in de search results
- Dot alleen tonen als er minimaal 1 datum geselecteerd is

## Stap 7: ProfessionalDetailModal.tsx aanpassen

Voeg een 5e tab "Beschikbaarheid" toe aan het Tabs component:

- TabsList wijzigen van `grid-cols-4` naar `grid-cols-5`
- Nieuwe `TabsTrigger value="beschikbaarheid"` met label "Beschikbaarheid"
- Nieuwe `TabsContent value="beschikbaarheid"` met:
  - `BeschikbaarheidMiniKalender` component met `professionalId={professional.id}`
  - Link "Volledig overzicht openen" die navigeert naar `/beschikbaarheid`

## Gewijzigde/Nieuwe Bestanden

1. `src/hooks/useBeschikbaarheidIndicator.ts` (nieuw) -- lichtgewicht datum-lookup
2. `src/hooks/useProfessionalWeekBeschikbaarheid.ts` (nieuw) -- per-professional week data
3. `src/components/beschikbaarheid/BeschikbaarheidDot.tsx` (nieuw) -- indicator dot
4. `src/components/beschikbaarheid/BeschikbaarheidMiniKalender.tsx` (nieuw) -- mini weekkalender
5. `src/components/planning/ToewijzingenBeheer.tsx` (wijzig) -- dots in zoekresultaten
6. `src/components/planning/NieuweDienstModal.tsx` (wijzig) -- dots in pre-toewijzing
7. `src/components/ProfessionalDetailModal.tsx` (wijzig) -- 5e tab met mini-kalender

## Technische Details

- Shift-mapping: `dienst_type === "dag"` checkt shifts `["dag", "hele_dag"]`, `"avond"` checkt `["avond", "hele_dag"]`, `"nacht"` checkt `["nacht", "hele_dag"]`, `"weekend"` checkt alle shifts
- Geen extra database migraties nodig
- Alle nieuwe hooks volgen het bestaande `useRealtimeChannel` patroon met 200ms debounce
- `useBeschikbaarheidIndicator` is bewust lichtgewicht: 1 query per datum, geen realtime (data wordt toch ververst via de bestaande channels)
