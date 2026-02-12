
# FA-1 -- Auto-Facturatie Engine

## Overzicht
Bouw een auto-facturatie engine die automatisch concept facturen genereert vanuit voltooide diensten. Bestaat uit een backend function, frontend hook, wizard-dialog en integratie in de Facturatie pagina.

## Stap 1: Edge Function -- agent-auto-facturatie/index.ts (NIEUW)

Nieuw bestand `supabase/functions/agent-auto-facturatie/index.ts`:

- Importeert `corsHeaders`, `createAdminClient`, `jsonResponse`, `handleCors`, `logInfo`, `logSuccess`, `logError` uit `_shared/core.ts`
- Twee acties: `preview` en `generate`
- **6 database stappen**:
  1. Query factureerbare diensten: status='voltooid', datum BETWEEN period_start/period_end, met JOINs naar dienst_toewijzingen, professionals, client_sublocations, client_locations, client_organizations
  2. Query reeds gefactureerde toewijzingen via factuur_regel.urenstaat_id (exclude set)
  3. Filter stap 1 resultaat: verwijder al gefactureerde toewijzingen
  4. Groepeer per opdrachtgever (client_org_id) met totalen
  5a. **Preview**: return opdrachtgevers met toewijzingen + totalen
  5b. **Generate**: voor elke (geselecteerde) opdrachtgever: insert factuur (CONCEPT/VERKOOP) + factuur_regels met urenstaat_id koppeling
- BTW: 21% standaard, bedragen afgerond op 2 decimalen
- Vervaldatum: factuurdatum + 30 dagen
- Referentie: "Auto-facturatie {period_start} t/m {period_end}"
- Logging naar function_call_logs
- Input validatie: org_id + period_start + period_end verplicht

## Stap 2: Config.toml entry

Voeg toe aan `supabase/config.toml` (na agent-dienst-matching, regel 555):

```text
[functions.agent-auto-facturatie]
verify_jwt = false
# Purpose: Auto-generate concept invoices from completed shifts
```

## Stap 3: Frontend Hook -- useAutoFacturatie.ts (NIEUW)

Nieuw bestand `src/hooks/facturatie/useAutoFacturatie.ts`:

- `fetchPreview(periodStart, periodEnd)`: haalt org_id op via user_organizations, roept edge function aan met action='preview'
- `generateFacturen(periodStart, periodEnd, selectedOpdrachtgeverIds?)`: roept edge function aan met action='generate', invalidates facturen + stats queries via FACTURATIE_QUERY_KEYS
- `reset()`: reset alle state
- State: isLoading, preview, generateResult, error

## Stap 4: UI Component -- AutoFacturatieDialog.tsx (NIEUW)

Nieuw bestand `src/components/facturatie/AutoFacturatieDialog.tsx`:

- 3-staps wizard dialog:
  - **Stap 1 - Periode**: Quick-select knoppen "Vorige maand" (default) en "Deze maand", "Preview ophalen" knop met Zap icoon
  - **Stap 2 - Preview**: Totalen bovenaan, per opdrachtgever: checkbox + naam + diensten/uren + bedrag, expandable toewijzingen detail, "Genereer N facturen" knop
  - **Stap 3 - Resultaat**: Success icoon, per factuur: factuurnummer + opdrachtgever + totaal + link naar detail pagina, "Sluiten" knop
- Emerald theme, max-w-2xl, ScrollArea max-height 400px
- NL currency format + NL locale datums

## Stap 5: Facturatie.tsx aanpassen

Wijzigingen aan `src/pages/Facturatie.tsx`:

- Voeg `Zap` toe aan lucide-react imports (regel 33-47)
- Import `AutoFacturatieDialog` (na regel 51)
- State: `const [showAutoDialog, setShowAutoDialog] = useState(false)` (na regel 126)
- "Auto-factureren" knop in PageHero, VOOR de "Instellingen" knop, emerald styling met Zap icoon
- Render `<AutoFacturatieDialog open={showAutoDialog} onOpenChange={setShowAutoDialog} />`

## Stap 6: hooks/facturatie/index.ts aanpassen

Voeg export toe: `export { useAutoFacturatie } from './useAutoFacturatie';`

## Gewijzigde/Nieuwe Bestanden

1. `supabase/functions/agent-auto-facturatie/index.ts` (nieuw) -- edge function met preview + generate
2. `supabase/config.toml` (wijzig) -- function config entry
3. `src/hooks/facturatie/useAutoFacturatie.ts` (nieuw) -- frontend hook
4. `src/components/facturatie/AutoFacturatieDialog.tsx` (nieuw) -- wizard dialog
5. `src/pages/Facturatie.tsx` (wijzig) -- knop + dialog integratie
6. `src/hooks/facturatie/index.ts` (wijzig) -- export toevoegen

## Technische Details

- Edge function gebruikt `createAdminClient()` (service role) voor volledige data toegang
- Dubbele facturatie preventie via check op factuur_regel.urenstaat_id (exclude reeds gefactureerde toewijzingen)
- BTW berekening met `?? 21` (nullish coalescing, consistent met bestaande facturatie logica)
- Factuurnummer wordt automatisch gegenereerd door bestaande database trigger
- FACTURATIE_QUERY_KEYS uit `./constants.ts` voor query invalidation
- Geen database migraties nodig (alle tabellen bestaan al)
