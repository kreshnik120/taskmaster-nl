
# P0-C: Multi-Date Picker + Pauze Auto-berekening

## Overzicht
Twee features in 1 bestand (`NieuweDienstModal.tsx`), geen database-wijzigingen nodig.

---

## Stap 1: Multi-Date Picker

### State wijziging
- Regel 68: `datum` (single `Date | undefined`) wordt `datums` (array `Date[]`, default `[new Date()]`)

### Edit-populate (regel 150)
- `setDatums([parseISO(editDienst.datum)])` (edit = altijd 1 datum)

### Reset (regel 195)
- `setDatums([new Date()])` i.p.v. `setDatum(new Date())`

### Validatie (regel 229)
- `datums.length === 0` i.p.v. `!datum`

### dienstData (regel 257)
- `datum: format(datums[0], "yyyy-MM-dd")` -- gebruikt eerste datum voor het data-object

### herhalingAantal useMemo (regel 222-225)
- Wijzig `!datum` naar `datums.length === 0`
- Gebruik `datums[0]` i.p.v. `datum`
- Dependency array: `[herhaling, datums, herhalingTot]`

### Herhaling calendar disabled (regel 629)
- `datum ? d <= datum : false` wordt `datums.length > 0 ? d <= datums[0] : false`

### Insert-logica herschrijven (regel 285-329)
Vervang de huidige single-insert + herhaling door:
1. Map alle `datums` naar insert-records
2. Batch insert alle records
3. Pre-toewijzing alleen op eerste dienst
4. Herhaling: voor ELKE ingevoegde dienst herhalingen aanmaken (loop over inserted array)
5. Totaal-telling: `datums.length * (1 + herhalingen)`

### Calendar UI (regel 394-406)
Vervang het hele datum-blok:
- Label: "Datum(s)" bij nieuw, "Datum" bij edit
- Button tekst: "X datums geselecteerd" bij meerdere
- Edit mode: `Calendar mode="single"`
- New mode: `Calendar mode="multiple"` met `onSelect={(d) => setDatums(d || [])}`
- Onder de calendar: chips met geselecteerde datums + X-knop per datum (alleen bij > 1 datum)

### Live preview (regel 677)
- Toon alle datums: bij 1 datum volledige weergave, bij meerdere: "X datums: d MMM, d MMM, ..."

---

## Stap 2: Pauze Auto-berekening

### Nieuwe state (na regel 71)
- `const [pauzeManual, setPauzeManual] = useState(false)`

### Edit-populate (na regel 153)
- `setPauzeManual(true)` -- bij bewerken altijd handmatig (bestaande waarde behouden)

### Reset
- `setPauzeManual(false)`

### Nieuw useEffect (na regel 205)
Auto-pauze op basis van bruto dienstduur (CAO-richtlijn):
- Bruto > 10 uur: 60 min
- Bruto > 8 uur: 45 min
- Bruto > 5.5 uur: 30 min
- Anders: 0 min
- Alleen als `pauzeManual === false`

### Pauze UI wijzigen (regel 431-438)
- Toevoegen "auto (CAO)" indicator naast label als niet-handmatig
- Bij handmatig wijzigen: `setPauzeManual(true)`
- "Terug naar auto" knop onder de Select als handmatig

---

## Technisch overzicht

| Onderdeel | Regels | Wijziging |
|-----------|--------|-----------|
| State | 68 | `datum` -> `datums: Date[]` |
| State | 71+ | Nieuw: `pauzeManual` |
| Edit-populate | 150, 153 | `setDatums([...])`, `setPauzeManual(true)` |
| Reset | 195 | `setDatums([new Date()])`, `setPauzeManual(false)` |
| Validatie | 229 | `datums.length === 0` |
| herhalingAantal | 222-225 | `datums[0]` + nieuwe deps |
| dienstData | 257 | `format(datums[0], ...)` |
| Insert-logica | 285-329 | Multi-date batch insert + herhaling per datum |
| Calendar UI | 394-406 | Single/multiple mode + chips |
| Pauze UI | 431-438 | Auto-indicator + manual toggle |
| Pauze effect | nieuw | CAO auto-berekening |
| Live preview | 677 | Multi-datum weergave |
| Herhaling cal | 629 | `datums[0]` referentie |

## Aandachtspunten
- `Calendar mode="multiple"` is ondersteund door react-day-picker v8 (reeds geinstalleerd)
- Pre-toewijzing alleen op eerste dienst van een batch (niet op herhalingen)
- Pauze auto-berekening raakt niet aan de database -- pauze_minuten wordt gewoon als getal opgeslagen
- Bij edit mode altijd single calendar + pauzeManual=true (geen onverwachte overschrijvingen)
