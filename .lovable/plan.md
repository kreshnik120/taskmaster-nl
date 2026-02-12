
# P0-B: Multi-Functieniveau + Certificeringen + 3e Opmerking + Pre-toewijzing

## Overzicht
Puur UI + logica wijzigingen, geen database migraties nodig (kolommen bestaan al uit P0-A). Wijzigingen in 4 bestanden.

---

## Stap 1: Multi-Functieniveau checkboxes (NieuweDienstModal.tsx)

- Regel 38: Breid `functieNiveaus` array uit naar 10 opties: `["HBO", "HBO-V", "VP5", "VP4", "VP3", "VIG", "Helpende Plus", "Helpende", "BEG4", "BEG3"]`
- Regel 71: Wijzig state van `const [functieNiveau, setFunctieNiveau] = useState("")` naar `const [functieNiveaus_selected, setFunctieNiveausSelected] = useState<string[]>([])`
- Regel 123: Edit-populate wijzigen naar `setFunctieNiveausSelected(editDienst.gevraagd_functie_niveau ?? [])`
- Regel 164: Reset wijzigen naar `setFunctieNiveausSelected([])`
- Regel 227: Save wijzigen naar `gevraagd_functie_niveau: functieNiveaus_selected`
- Regel 417-429: Vervang het 2-kolom grid (Select + Aantal) door:
  - Checkbox grid (2 kolommen, 10 niveaus) met multi-select
  - Daaronder een full-width "Aantal medewerkers" Input
- Regel 537: Live preview update naar `functieNiveaus_selected.join(", ")`

## Stap 2: Certificeringen checkbox-groep (NieuweDienstModal.tsx)

- Nieuwe constante: `certificeringOpties = ["BHV", "SKJ", "Medicatie", "Tilliften", "Voorbehouden handelingen", "Agressie", "EMB", "EVC"]`
- Nieuwe state: `const [certificeringen, setCertificeringen] = useState<string[]>([])`
- Edit-populate: `setCertificeringen(editDienst.vereiste_certificeringen ?? [])`
- Reset: `setCertificeringen([])`
- Save: `vereiste_certificeringen: certificeringen`
- UI: Na functieniveau checkboxes, conditioneel (alleen als >= 1 niveau geselecteerd) een tweede checkbox grid met certificeringen
- Live preview: certificeringen tonen als ze geselecteerd zijn

## Stap 3: Flexwerker opmerking (NieuweDienstModal.tsx)

- Nieuwe state: `const [flexwerkerOpmerking, setFlexwerkerOpmerking] = useState("")`
- Edit-populate: `setFlexwerkerOpmerking(editDienst.flexwerker_opmerking ?? "")`
- Reset: `setFlexwerkerOpmerking("")`
- Save: `flexwerker_opmerking: flexwerkerOpmerking || null`
- UI: Drie opmerkingsvelden in volgorde: Publiek -> Flexwerker (nieuw) -> Prive
  - Verplaats prive opmerking (huidige regel 492-495) ONDER publieke opmerking
  - Voeg flexwerker opmerking ertussen met placeholder "Alleen zichtbaar na toewijzing (parkeercode, pincode, etc.)"

## Stap 4: Detail sheet uitbreiden (DienstDetailSheet.tsx)

- Na functieniveau DetailRow (regel 133): certificeringen DetailRow toevoegen (conditioneel)
- Na publieke opmerking blok (regel 163-171): flexwerker opmerking blok toevoegen in blauw kader met MessageSquare icon

## Stap 5: Pre-toewijzing zoekfunctie (NieuweDienstModal.tsx)

- Nieuwe states: `preToewijzingId`, `preToewijzingNaam`, `proSearch`, `proSearchOpen`, `debouncedProSearch`
- Debounce effect (300ms) op proSearch
- useQuery op `professionals` tabel: zoek op `full_name` met ILIKE, filter op `deleted_at IS NULL` en status `actief`/`beschikbaar`, limit 10
- UI na "Aantal medewerkers": Popover met zoekbalk en resultatenlijst, of groen kader met geselecteerde naam + X-knop
- Na succesvolle insert: automatisch `dienst_toewijzingen` record aanmaken met status "toegewezen"
- Reset: alle pre-toewijzing states clearen
- Live preview: geselecteerde flexwerker tonen

## Stap 6: Certificering filter (PlanningFilters.tsx + useDienstenPlanning.ts)

- `DienstFilters` interface uitbreiden met `certificering: string` (default `"all"`)
- PlanningFilters.tsx: nieuwe Select dropdown voor certificering met opties
- useDienstenPlanning.ts: client-side filter toevoegen: `d.vereiste_certificeringen?.includes(filters.certificering)`
- `getDefaultFilters()` uitbreiden met `certificering: "all"`
- Planning.tsx: `filters` initial state en `activeCount` in PlanningFilters bijwerken

---

## Technisch overzicht

| Bestand | Wijzigingen |
|---------|-------------|
| `NieuweDienstModal.tsx` | Multi-select functieniveau, certificeringen, flexwerker opmerking, pre-toewijzing zoek |
| `DienstDetailSheet.tsx` | Certificeringen DetailRow, flexwerker opmerking blauw kader |
| `PlanningFilters.tsx` | Certificering filter dropdown, activeCount bijwerken |
| `useDienstenPlanning.ts` | DienstFilters interface + certificering filter logica |
| `Planning.tsx` | Initial filters state uitbreiden met certificering |

## Aandachtspunten

- Pre-toewijzing query filtert op `deleted_at IS NULL` en status IN ('actief', 'beschikbaar') -- beide kolommen zijn bevestigd aanwezig op de professionals tabel
- Pre-toewijzing wordt NIET meegekopieerd bij kopieer-actie (kopie is altijd zonder toewijzing)
- Certificeringen UI verschijnt alleen als >= 1 functieniveau is geselecteerd (conditioneel)
- De opmerkingsvelden worden herschikt: Publiek -> Flexwerker -> Prive (was: Prive -> Publiek)
