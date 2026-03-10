

# Diagnostisch paneel "Ongebruikte velden" toevoegen aan BendySync

## Wat

Een nieuw Card onderaan `src/pages/BendySync.tsx` dat analyseert welke Bendy user-velden we niet gebruiken. On-demand laden via een knop.

## Wijzigingen

**Bestand:** `src/pages/BendySync.tsx`

1. **State toevoegen** (bij bestaande state, ~regel 144):
   - `unusedFieldsAnalysis` (array | null)
   - `analysisLoading` (boolean)

2. **Analyse-functie toevoegen**: `fetchUnusedFieldsAnalysis` — haalt 500 records uit `bendy_raw_cache` (entity_type = 'users'), analyseert 13 ongebruikte velden (languages, region, working_hours_per_week, etc.), telt fill-rates en verzamelt 5 voorbeeldwaarden per veld.

3. **Card toevoegen** na de pending mappings sectie (~regel 1042), vóór de sluitende `</div>`:
   - Titel: "Bendy Data Analyse — Ongebruikte velden"
   - Beschrijving onder de titel
   - "Analyse starten" knop met loading state
   - Resultaat-tabel met kolommen: Veld, Gevuld ({filled}/{total}), percentage-badge (groen >50%, oranje 10-50%, grijs <10%), Voorbeelden als badges
   - Gesorteerd op percentage (hoogste eerst)

Geen bestaande code wordt gewijzigd — alleen toevoegingen.

