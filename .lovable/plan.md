

# UI Analyse: Professionals Pagina — Indeling & Hierarchie

## Wat ik zie (huidige situatie)

De pagina heeft 4 lagen boven de data:
```text
┌─────────────────────────────────────────────┐
│  1. Hero: "Professionals" + "1000 in je     │  ~50px
│     netwerk" + Toevoegen knop               │
├─────────────────────────────────────────────┤
│  2. KPI rij: 5 kaarten breed               │  ~90px
├─────────────────────────────────────────────┤
│  3. Filter bar: zoek + 5 dropdowns + sort   │  ~40px
│     + view toggle                           │
├─────────────────────────────────────────────┤
│  4. Data (kaarten of tabel)                 │  rest
└─────────────────────────────────────────────┘
```

**~180px aan overhead** voordat je de eerste professional ziet. Op een 995px viewport is dat 18% van het scherm.

### Specifieke problemen in de huidige indeling

**A. Filter bar is overweldigend**
6 dropdowns + zoekbalk op één rij. De sortering staat visueel op dezelfde lijn als filters, maar is functioneel iets anders. Een gebruiker die snel wil zoeken moet door een muur van controls navigeren.

**B. Zoeken is niet gedebounced**
Elke toetsaanslag filtert direct over 1000 records — merkbare vertraging.

**C. Lijstweergave: rijen zijn te hoog**
Elke rij is ~55px omdat de org-badge onder de naam staat op een tweede regel. In een tabel met 1000 records is elke pixel per rij significant — dat is het verschil tussen 9 en 13 zichtbare rijen.

**D. Lijstweergave: lege kolommen**
"Regio" is bij bijna alle records "—". "Geregistreerd" toont overal "20 dagen geleden". Deze kolommen nemen breedte in maar voegen geen scanwaarde toe.

**E. Grid: geen statuslabel**
De status is alleen een 2.5px dot. In de lijstweergave staat wél een badge met tekst. In de grid mis je dit volledig.

**F. Filters scrollen weg**
Bij het scrollen verdwijnt de hele toolbar. Je moet terug naar boven om te filteren.

---

## Verbeterplan — alleen herindeling, geen nieuwe functionaliteit

### 1. Zoekbalk debounce toevoegen
- `useDebouncedValue` (300ms) toepassen op `searchTerm` — hook bestaat al in het project
- **Bestand**: `Professionals.tsx`

### 2. Filter bar opsplitsen: zoek apart, filters gegroepeerd
Huidige situatie: alles op één rij. Voorstel:
```text
┌─ Zoek ──────────────────────┐  ┌─ Resultaat ─┐  ┌─ View ─┐
│ 🔍 Zoek op naam...          │  │ 322 van 1000│  │ ⊞  ☰  │
└─────────────────────────────┘  └─────────────┘  └────────┘
  Functie ▾   Werkvorm ▾   Status ▾   Docs ▾   Sorteer ▾   ✕ Reset
```
- Zoekbalk op eigen regel, breder en prominenter (dit is de #1 actie)
- Resultaatcount + view toggle rechts op dezelfde regel
- Filters + sorteer op tweede regel, kleiner
- **Bestand**: `Professionals.tsx`

### 3. Sticky filter toolbar
- Wrap de hele filterzone in `sticky top-0 z-30` met `bg-background/90 backdrop-blur-md`
- Zodat filters altijd bereikbaar zijn bij scrollen
- **Bestand**: `Professionals.tsx`

### 4. Lijstweergave: compactere rijen
- Org-badge naast de naam plaatsen (op dezelfde regel) in plaats van eronder — scheelt ~20px per rij
- "Regio" en "Geregistreerd" kolommen verbergen op kleinere schermen maar ook op xl alleen tonen als ze daadwerkelijk gevuld zijn (niet allemaal "—")
- **Bestand**: `ProfessionalListView.tsx`

### 5. Grid: statuslabel toevoegen
- Klein tekstlabel naast de status-dot: "Actief" / "Inactief" / "Pauze"
- 10px tekst, zelfde kleur als de dot, op de naam-regel rechts uitgelijnd
- **Bestand**: `ProfessionalCard.tsx`

### 6. Lijst als standaard bij 1000 records
- Bij `professionals.length > 100`: default `viewMode` naar `'list'`
- Gebruiker kan altijd handmatig naar grid switchen
- **Bestand**: `Professionals.tsx`

---

## Bestanden

| Bestand | Wijziging |
|---|---|
| `src/pages/Professionals.tsx` | Debounce, filterbar herindeling, sticky toolbar, smart default view |
| `src/components/recruitment/ProfessionalCard.tsx` | Statuslabel naast dot |
| `src/components/recruitment/ProfessionalListView.tsx` | Compactere rijen, org-badge inline |

