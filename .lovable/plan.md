

# P-DEDUP-2: Eenmalige migratie — Duplicaat-diensten samenvoegen

## Actie
Vier SQL statements uitvoeren via de database insert tool om 13 duplicaat-diensten samen te voegen. Geen codewijzigingen.

1. **Stap 1** — Verplaats toewijzingen van loser-diensten naar de winner (oudste `id` per groep). Slaat over als professional al gekoppeld is aan winner.
2. **Stap 2** — Update `gevraagd_aantal` op winner-diensten naar de groepsgrootte (2 of 3).
3. **Stap 3** — Verwijder de 13 loser-diensten.
4. **Stap 4** — Verificatie: tel diensten en uren deze week. Verwacht ~152 bezet, uren dichter bij 1050.5.

Alle queries gebruiken dezelfde CTE `duplicate_groups` (sublocation_id + datum + start_tijd + eind_tijd, HAVING COUNT > 1) als basis.

## Niet aanraken
Geen code, geen schema, geen edge functions.

