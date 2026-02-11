
# Prompt #1C — Detail Sheet, Aanmaak Modal, Toewijzingen & Quick Actions

## Overzicht

4 nieuwe componenten + integratie met bestaande Planning.tsx. Bouwt voort op de bestaande database tabellen (diensten, dienst_toewijzingen), de useDienstenPlanning hook, en de UI componenten uit #1B.

---

## Nieuwe Bestanden (4 componenten)

### 1. `src/components/planning/DienstDetailSheet.tsx`

Sheet (slide-over van rechts) met max-w-3xl voor twee-kolom layout.

**Props:**
- `dienst: DienstData | null`
- `open: boolean`
- `onClose: () => void`
- `onEdit: (dienst: DienstData) => void`
- `onCopy: (dienst: DienstData) => void`
- `onDelete: (dienst: DienstData) => void`

**Layout:**
- Header: Sublocation naam + organisatie naam + DienstStatusBadge + sluiten knop
- Actieknoppen (btn-group): Sluiten dienst (destructive), Bevestigen (groen, alleen als positieve reacties), Bewerken (outline), Kopieren (outline), Verwijderen (ghost destructive)
- Twee kolommen via `grid grid-cols-1 md:grid-cols-2 gap-6`:
  - **Links**: Dienst details als dl-lijst (datum via `format(date, "EEEE d MMMM yyyy", {locale: nl})`, tijden, netto uren, functieniveau badge, dienst type, werkvorm, tarief met euro formatting, status badge, accepteerbaar, bron, aangemaakt op). Prive opmerking in gele card met Lock icon. Publieke opmerking in neutrale card.
  - **Rechts**: Opdrachtgever info uit `dienst.sublocation` relatie (organisatie naam, sublocation naam, adres, postcode, plaats, telefoon als tel: link, sector, doelgroep, publieke_opmerking)
- Onderaan: `ToewijzingenBeheer` component (full width)

**Acties (Supabase mutations):**
- Sluiten: `supabase.from('diensten').update({status: 'geannuleerd'})` + toast + invalidate
- Bevestigen: `supabase.from('dienst_toewijzingen').update({status: 'bevestigd'}).eq('dienst_id', dienst.id).in('status', ['positief'])` + toast + invalidate
- Kopieren/Verwijderen: delegeert naar parent via props
- Bewerken: delegeert naar `onEdit` prop

**Bevestigingsdialoog:** AlertDialog voor destructieve acties (sluiten dienst, verwijderen)

---

### 2. `src/components/planning/ToewijzingenBeheer.tsx`

Tabel component binnen de detail sheet.

**Props:**
- `dienst: DienstData`

**Header:** "Toewijzingen & Reacties" + bezetting badge "(X/Y)" + Progress bar

**Tabel kolommen:** Flexwerker (naam), Niveau (functie_niveau), Status (gekleurde badge), Reactie op (datum/tijd), Reactie door (naam), Acties (knoppen)

**Status kleuren (toewijzing-specifiek):**
- voorgesteld: slate
- positief: amber
- misschien: purple
- bevestigd: emerald
- afgewezen: rose
- no_show: red
- voltooid: blue

**Acties per status:**
- voorgesteld: Verwijderen (X knop) -- DELETE
- positief: Bevestigen, Afwijzen, Ongedaan -- UPDATE status
- misschien: Bevestigen, Afwijzen, Ongedaan -- UPDATE status
- bevestigd: Ongedaan (terug naar positief) -- UPDATE status
- afgewezen: Ongedaan (terug naar voorgesteld) -- UPDATE status

**Professional toewijzen (onder tabel):**
- Popover met Command/Combobox die zoekt in `professionals` tabel
- Query: `supabase.from('professionals').select('id, full_name, functie_niveau, telefoonnummer, email').is('deleted_at', null).in('status', ['actief', 'beschikbaar']).ilike('full_name', '%search%').limit(20)`
- Bij selectie: INSERT in `dienst_toewijzingen` met status 'voorgesteld'
- Overlap error handling: catch trigger exception, toon toast.error

Na elke mutatie: `queryClient.invalidateQueries({queryKey: ['diensten-planning']})`

---

### 3. `src/components/planning/NieuweDienstModal.tsx`

Dialog (max-w-4xl) met twee-kolom layout, volgt InterviewSchedulingModal patroon.

**Props:**
- `open: boolean`
- `onClose: () => void`
- `editDienst: DienstData | null` (null = nieuw, anders = bewerken)

**Linkerkolom -- Formulier (useState, geen react-hook-form):**

1. **Opdrachtgever cascade (3 stappen):**
   - Stap 1: Organisatie select via `useClientOrganizations()` hook (bestaat al)
   - Stap 2: Locatie select -- query `client_locations` gefilterd op `client_org_id`
   - Stap 3: Sublocation select -- query `client_sublocations` gefilterd op `location_id`
   - Elke stap verschijnt pas na vorige selectie

2. **Titel:** Input, autofill "[Org] - [Sublocation]" na locatie selectie, overschrijfbaar
3. **Datum:** Datumpicker (Calendar + Popover, NL locale, min=vandaag, pointer-events-auto)
4. **Tijden:** Twee Select components (start 06:00-23:00, eind 06:30-23:30, stappen van 30 min) + berekende duur
5. **Pauze:** Select (0, 15, 30, 45, 60 min)
6. **Functieniveau:** Select (HBO-V, VP4, VP3, VIG, Helpende 2)
7. **Aantal:** Number input (1-10)
8. **Werkvorm:** Select (ZZP, Uitzendkracht)
9. **Dienst type:** Button group chips (Dag/Avond/Nacht/Weekend)
10. **Tarief:** Number input met euro prefix (optioneel)
11. **Herhaling:** Select (Geen/Dagelijks/Wekelijks/Tweewekelijks) + extra datumpicker bij herhaling + berekening "X diensten"
12. **Opmerkingen:** Twee Textareas (prive + publiek)
13. **Status:** Select (Concept/Open)
14. **Accepteerbaar:** Checkbox

**Rechterkolom -- Live Preview:**
- Glass morphism card die live update met formulierwaarden
- Toont samenvatting: locatie, datum, tijden, functie, werkvorm, tarief, herhaling info, status
- Niet-ingevulde velden tonen als "--" in muted

**Bij opslaan (nieuw):**
1. Valideer verplichte velden (sublocation_id, datum, start_tijd, eind_tijd, titel)
2. Haal user + org_id op via `supabase.auth.getUser()` + `user_organizations`
3. INSERT in `diensten` tabel (netto_uren is GENERATED, niet meesturen)
4. Bij herhaling: genereer extra INSERT records met verschoven datums + `herhaling_parent_id` + `bron='herhaling'`
5. Toast + invalidate + sluiten

**Bij opslaan (bewerken):**
- UPDATE in plaats van INSERT
- Toast "Dienst bijgewerkt!" + invalidate + sluiten

---

### 4. `src/components/planning/DienstQuickActions.tsx`

Context menu (rechtermuisklik) op DienstCards.

**Props:**
- `dienst: DienstData`
- `children: React.ReactNode` (de DienstCard als trigger)
- `onOpen: (dienst: DienstData) => void`
- `onEdit: (dienst: DienstData) => void`
- `onCopy: (dienst: DienstData) => void`
- `onDelete: (dienst: DienstData) => void`

**Menu items:** Openen (Eye), Bewerken (Pencil), Kopieren (Copy), Publiceren (Send, alleen bij concept status), Separator, Verwijderen (Trash2, destructive)

Gebruikt shadcn `ContextMenu` component.

---

## Bestaand Bestand Wijzigen

### `src/pages/Planning.tsx`

**State toevoegen:**
```
const [selectedDienst, setSelectedDienst] = useState<DienstData | null>(null);
const [nieuweDienstOpen, setNieuweDienstOpen] = useState(false);  // al aanwezig, maar nu gekoppeld
const [editDienst, setEditDienst] = useState<DienstData | null>(null);
```

**Handlers toevoegen:**
- `handleDienstClick`: `setSelectedDienst(dienst)` (vervangt huidige lege callback)
- `handleCopyDienst`: INSERT kopie met datum+1, bron='gekopieerd', toast + invalidate
- `handleDeleteDienst`: AlertDialog bevestiging, DELETE, toast + invalidate

**Imports toevoegen:** DienstDetailSheet, NieuweDienstModal, DienstQuickActions

**JSX toevoegen (na kalender/lijst content):**
- `DienstDetailSheet` met selectedDienst state
- `NieuweDienstModal` met nieuweDienstOpen + editDienst state

**DienstCard wrapping:** In PlanningWeekKalender en PlanningLijstWeergave, de DienstCards wrappen met DienstQuickActions voor rechtermuisklik support. Dit vereist kleine aanpassingen in die componenten om `onEdit`, `onCopy`, `onDelete` callbacks door te geven.

### `src/components/planning/PlanningWeekKalender.tsx`

- Extra props: `onEdit`, `onCopy`, `onDelete` (optioneel)
- DienstCards wrappen met DienstQuickActions

### `src/components/planning/PlanningLijstWeergave.tsx`

- Extra props: `onEdit`, `onCopy`, `onDelete` (optioneel)
- Rijen wrappen met DienstQuickActions

---

## Technisch Overzicht

| Bestand | Actie |
|---------|-------|
| `src/components/planning/DienstDetailSheet.tsx` | Nieuw |
| `src/components/planning/ToewijzingenBeheer.tsx` | Nieuw |
| `src/components/planning/NieuweDienstModal.tsx` | Nieuw |
| `src/components/planning/DienstQuickActions.tsx` | Nieuw |
| `src/pages/Planning.tsx` | Wijzigen (state + handlers + imports + JSX) |
| `src/components/planning/PlanningWeekKalender.tsx` | Wijzigen (extra props + QuickActions wrapper) |
| `src/components/planning/PlanningLijstWeergave.tsx` | Wijzigen (extra props + QuickActions wrapper) |

Totaal: 4 nieuwe bestanden + 3 wijzigingen. Geen database migraties nodig -- alle tabellen bestaan al.
