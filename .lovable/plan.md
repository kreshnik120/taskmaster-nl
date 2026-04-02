
# Analyse: Verschil Bendy UI vs. Ons Systeem — Week 14

## Bevindingen

### Bendy UI toont (jouw screenshot):
- **13 openstaande diensten**
- **198 ingeplande diensten, 1398.25 uur**
- **Totaal: 211 actieve diensten**

### Onze database toont:
- **7 open diensten**
- **187 ingepland (volledig_bezet), 1315.25 uur**
- **Totaal: 194 actieve diensten**
- **89 geannuleerde diensten** (waarvan 82 onterecht)

### Verschil: 17 diensten missen (6 open + 11 ingepland)

---

## Oorzaak: Kettingreactie van 3 bugs

### Bug 1: Valse annuleringen op 1 april (HOOFDOORZAAK)
Op 1 april om 13:51 heeft de stale-detectie **34 diensten** onterecht geannuleerd met melding "Auto: niet meer in Bendy API". Dit gebeurde omdat:
- De oude hard cap van 10.000 was bereikt (API leverde 10.080 open + 10.413 assigned)
- De `hitCap`-veiligheidsvlag bestond **nog niet** op dat moment
- ~600 records werden niet opgehaald → stale-detectie zag ze niet → markeerde ze als verdwenen
- Eerder (23 maart, 13-16 maart) waren al 54 diensten op dezelfde manier geannuleerd

### Bug 2: Hard cap nog steeds te laag
Na onze verhoging naar 15.000 haalt de sync nu 15.219 closed + 15.120 open = **30.339 records**. Maar `hitCap` is NOG STEEDS `true` (stale_checked = -1), wat betekent dat stale-detectie permanent uitgeschakeld blijft. De sync kan niet verifiëren of records echt verdwenen zijn.

### Bug 3: Geannuleerde diensten worden niet hersteld
De sync-logica (regels 241-260) herstelt geannuleerde diensten als de API ze retourneert. De sync op 2 april updatte 540 records, maar de 82 wrongly-cancelled diensten werden NIET hersteld. Dit betekent dat de API ze niet meer retourneert — waarschijnlijk zijn ze in Bendy van "open" naar "assigned" verplaatst (status veranderd) maar vallen ze buiten de 15.000-limiet van één van beide endpoints.

---

## Fixplan

### Stap 1: Eenmalige database-herstel (SQL migratie)
Alle diensten in week 14 die `geannuleerd` staan met "Auto: niet meer in Bendy API" EN waarvan het bendy_id nog steeds bestaat in de `bendy_raw_cache` → status terugzetten naar `open`. De eerstvolgende sync corrigeert dan de status naar het juiste (open of volledig_bezet).

### Stap 2: Hard cap verwijderen, paginatie per datum gebruiken
Het probleem is structureel: er zijn **meer dan 15.000 records per endpoint**. In plaats van de cap steeds te verhogen, moet de fetch-logica het datumvenster opsplitsen in kleinere blokken (bijv. per week) zodat elk blok onder de limiet blijft. Dit garandeert dat ALLE records worden opgehaald.

### Stap 3: Stale-detectie robuuster maken
Voeg skipped records (sublocation_miss) toe aan `seenBendyIds` zodat ze niet per ongeluk als "verdwenen" worden gemarkeerd. Dit is een extra veiligheidslaag.

### Stap 4: Sync triggeren en verificeren
Na de fixes een sync draaien en week 14 vergelijken:
- Open: 7 → verwacht ~13
- Ingepland: 187 → verwacht ~198
- Uren: 1315 → verwacht ~1398

## Technisch

| Bestand | Wijziging |
|---|---|
| Database migratie | Herstel ~82 onterecht geannuleerde diensten |
| `bendy-helpers.ts` | Verwijder globale MAX_TOTAL_RECORDS, vervang door datum-windowed fetching |
| `bendy-sync-requisitions.ts` | Stale-detectie: voeg skipped bendy_ids toe aan seenBendyIds |
| Edge function | Re-deploy + full sync |
