

# Audit Planning-pagina & Bendy-koppeling — Bevindingen & Fixplan

## Samenvatting

Na grondige analyse van alle componenten, database-data, queries, RLS-policies en de Bendy-sync zijn **7 concrete problemen** gevonden, variërend van data-bugs tot UI-logica-fouten. Hieronder staat elk probleem met bewijs, impact en de voorgestelde fix.

---

## Probleem 1: Kopiëren dienst mist `netto_uren` → NULL in database

**Ernst: HOOG**

**Bewijs**: In `Planning.tsx` regel 104-138 kopieert `handleCopyDienst` alle velden behalve `netto_uren`. De database heeft **geen trigger** die `netto_uren` automatisch berekent, en de kolom heeft **geen default** (`column_default: nil`). Het gekopieerde record krijgt `netto_uren = NULL`.

**Impact**: 
- KPI "uren ingepland" (stats.totaalUrenWeek) telt `NULL` als 0 → totaal te laag
- DienstCard toont "null u" in lijstweergave
- Bezettingsgraad wordt verkeerd berekend

**Fix**: Voeg `netto_uren: dienst.netto_uren` toe aan de insert in `handleCopyDienst`. Overweeg ook een database-trigger die `netto_uren` automatisch berekent bij INSERT/UPDATE.

---

## Probleem 2: NieuweDienstModal slaat `netto_uren` niet op

**Ernst: HOOG**

**Bewijs**: `NieuweDienstModal.tsx` berekent `duur` (regel 328) via `berekeningDuur()` maar stuurt dit **niet mee** in het `dienstData` object (regels 400-427). Het veld `netto_uren` ontbreekt volledig.

**Impact**: Handmatig aangemaakte diensten hebben `netto_uren = NULL`. Alleen Bendy-geïmporteerde diensten hebben correcte uren.

**Fix**: Voeg `netto_uren: duur` toe aan het `dienstData` object in `handleSave`.

---

## Probleem 3: 5 duplicaat-diensten in Week 15 (Bendy dedup faalt)

**Ernst: MIDDEL**

**Bewijs uit database**: Er zijn 5 paren diensten op dezelfde sublocation, datum en tijden, maar met **verschillende bendy_id's** en statussen (bijv. `open` + `volledig_bezet`). Voorbeeld:
- Sublocation `6421 NAH-WV Veghel Mondriaan`, 2026-04-09, 07:00-15:30: bendy_id 17455641 (volledig_bezet) + 17507387 (open)
- Dit zijn aparte Bendy records (verschil in bendy_id), maar representeren mogelijk dezelfde fysieke dienst

**Impact**: Open-diensten telling is te hoog (52 i.p.v. ~47). De planning toont dubbele kaarten voor dezelfde locatie/tijdslot.

**Fix**: Dit is een Bendy-bronprobleem. In de sync-logica kan een dedup-check worden toegevoegd: als een dienst met dezelfde sublocation+datum+tijden al bestaat met status `volledig_bezet`, sla de nieuwe `open` variant over of annuleer hem.

---

## Probleem 4: Nachtdienst-uren worden fout berekend in `berekeningDuur`

**Ernst: MIDDEL**

**Bewijs**: De functie `berekeningDuur` in `NieuweDienstModal.tsx` (regel 46-53) handelt nachtdiensten correct af door 24 uur op te tellen als `eind < start`. MAAR de database toont inconsistenties voor bestaande nachtdiensten: dienst `ed692866` heeft `start_tijd=22:00, eind_tijd=11:00, netto_uren=13.00` terwijl de eenvoudige SQL-berekening `-11.00` geeft. Dit betekent dat de Bendy-import de correcte waarde al meestuurt, maar de UI-berekening en de DB-berekening zijn niet aligned.

**Impact**: Als je een nachtdienst handmatig bewerkt en opslaat, wordt `netto_uren` niet mee-opgeslagen (zie Probleem 2), waardoor de waarde verloren gaat.

**Fix**: Gekoppeld aan Probleem 2 — als `netto_uren` correct wordt opgeslagen via de modal, is dit opgelost.

---

## Probleem 5: Stats gebruiken `rawDiensten` maar toggle-knoppen filteren `diensten`

**Ernst: LAAG**

**Bewijs**: In `useDienstenPlanning.ts`:
- `stats` (regels 220-242) worden berekend op `rawDiensten` (alle data, vóór client-side filters)
- `diensten` (regels 206-217) zijn gefilterd op status/bureau/locatie etc.
- De WeekKalender toont `diensten` (gefilterd) maar KPI's tonen `rawDiensten` (ongefilterd)

**Impact**: Als een gebruiker filtert op bijv. "ABCzorg", tonen de KPI-kaarten nog steeds cijfers voor ALLE bureaus. Dit is verwarrend maar kan ook als "by design" worden gezien (KPI's = totaaloverzicht).

**Fix**: Overwegen om een `filteredStats` variant toe te voegen, of het als intentioneel gedrag te documenteren.

---

## Probleem 6: Realtime kanalen falen constant → `CHANNEL_ERROR`

**Ernst: LAAG (functioneel)**

**Bewijs uit console logs**: Beide kanalen (`planning-diensten` en `planning-toewijzingen`) geven herhaaldelijk `CHANNEL_ERROR`. Dit kan komen doordat de Realtime-publicatie niet is ingeschakeld voor de tabellen `diensten` en/of `dienst_toewijzingen`.

**Impact**: Realtime updates werken niet — wijzigingen door andere gebruikers of de Bendy-sync verschijnen pas na handmatig verversen of na de `staleTime` van 30 seconden.

**Fix**: Voeg `ALTER PUBLICATION supabase_realtime ADD TABLE public.diensten;` en `ALTER PUBLICATION supabase_realtime ADD TABLE public.dienst_toewijzingen;` toe als migratie.

---

## Probleem 7: PlanningLijstWeergave berekent bezetting anders dan DienstCard

**Ernst: LAAG**

**Bewijs**: 
- `PlanningLijstWeergave.tsx` (regel 41-43): telt `actieve_toewijzingen.length` simpelweg
- `DienstCard.tsx` (regel 26-28): gebruikt `berekenBezetting()` die bij multi-positie unieke `positie_nr` telt via `Set`
- Bij multi-positie diensten (gevraagd_aantal > 1) geeft de lijstweergave een te hoge bezetting

**Fix**: Gebruik `berekenBezetting()` ook in `PlanningLijstWeergave.tsx`.

---

## Samenvatting prioriteiten

| # | Probleem | Ernst | Fix-complexiteit |
|---|----------|-------|-----------------|
| 1 | Kopiëren mist netto_uren | HOOG | 1 regel |
| 2 | NieuweDienstModal mist netto_uren | HOOG | 1 regel |
| 3 | Bendy-duplicaten (5 paren) | MIDDEL | Sync-logica uitbreiden |
| 4 | Nachtdienst-uren bij bewerken | MIDDEL | Opgelost door #2 |
| 6 | Realtime CHANNEL_ERROR | LAAG | 1 migratie |
| 7 | Bezettingsberekening inconsistent | LAAG | 3 regels |
| 5 | Stats vs filter mismatch | LAAG | Design-keuze |

## Geen problemen gevonden bij

- **RLS policies**: Correct geconfigureerd op org_id basis voor alle CRUD operaties
- **Supabase query limiet**: 284 records in Week 15, ver onder de 1000-limiet
- **Sublocation referenties**: Alle diensten hebben geldige sublocation_id's
- **Status-consistentie**: Geen open diensten met actieve toewijzingen, geen bezette diensten zonder toewijzingen
- **Date range berekening**: Week- en maand-ranges zijn correct
- **Lock-version optimistic locking**: Correct geïmplementeerd bij update en sluiten
- **Filter-logica**: Alle 7 filters werken correct client-side

