
# 3 P1 Features: Spoed, Kleur & 24-uurs Diensten

## Overzicht
Drie nieuwe features voor de Planning module in exact 8 bestanden + 1 database migratie.

## Stap 1: Database Migratie
Twee nieuwe kolommen toevoegen aan de `diensten` tabel:
- `is_spoed` (BOOLEAN, default false) -- markeer urgente diensten
- `kleur` (TEXT, default null) -- kleurcodering voor visuele categorisatie

## Stap 2: Hook Updates (`useDienstenPlanning.ts`)
- `DienstData` interface: `is_spoed` en `kleur` velden toevoegen
- `DienstFilters` interface: `spoed` filter toevoegen
- `getDefaultFilters()`: `spoed: "all"` toevoegen
- Client-side filters: spoed filtering logica toevoegen

## Stap 3: NieuweDienstModal (`NieuweDienstModal.tsx`)
- Nieuwe state: `isSpoed`, `kleur`, `show24hConfirm`
- Edit-populate: `is_spoed` en `kleur` inladen bij bewerken
- Reset on close: nieuwe state meenemen
- dienstData object: `is_spoed` en `kleur` meegeven bij opslaan
- 24-uurs detectie: blokkade (start === eind error) verwijderen
- 24-uurs bevestigingsdialoog via useEffect + AlertDialog
- UI: Spoed toggle (Checkbox) + Kleur kiezer (7 opties incl. "Geen")
- Live preview: spoed en kleur tonen in samenvatting

## Stap 4: DienstCard (`DienstCard.tsx`)
- Compact mode: spoed emoji voor tijden, kleur als border override
- Full mode: SPOED badge, kleur border override

## Stap 5: PlanningLijstWeergave (`PlanningLijstWeergave.tsx`)
- Kleur dot + spoed emoji voor datum in elke rij

## Stap 6: DienstDetailSheet (`DienstDetailSheet.tsx`)
- Spoed DetailRow met emoji
- Kleur DetailRow met visuele kleur-indicator

## Stap 7: PlanningFilters (`PlanningFilters.tsx`)
- Spoed filter dropdown (Alle / Alleen spoed / Geen spoed)
- activeCount, reset, preset save/load bijwerken

## Stap 8: Planning.tsx
- Initial filters: `spoed: "all"` toevoegen
- handleCopyDienst: `is_spoed` en `kleur` meekoopieren

---

## Technisch overzicht

| Bestand | Wijzigingen |
|---------|-------------|
| Database migratie | `is_spoed BOOLEAN`, `kleur TEXT` |
| `useDienstenPlanning.ts` | Interface + filter + default |
| `NieuweDienstModal.tsx` | State, populate, save, 24h dialoog, UI controls |
| `DienstCard.tsx` | Spoed emoji, kleur border |
| `PlanningLijstWeergave.tsx` | Kleur dot, spoed emoji |
| `DienstDetailSheet.tsx` | 2 nieuwe DetailRows |
| `PlanningFilters.tsx` | Spoed dropdown + preset support |
| `Planning.tsx` | Default filter + copy handler |
