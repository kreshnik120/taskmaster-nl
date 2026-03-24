

# DIAG-2: Diagnostiek diensten vs toewijzingen week 13

## Actie
Drie read-only SQL queries uitvoeren via `psql` om het verschil tussen 213 (abcito) en 155 (Bendy) diensten te analyseren. Geen codewijzigingen, geen migraties.

1. **Query 1** — Diensten per status + bron → toont of het verschil uit handmatige of geïmporteerde diensten komt
2. **Query 2** — Toewijzingen per status → toont hoeveel diensten wel/niet een professional gekoppeld hebben
3. **Query 3** — Bendy raw cache telling → toont wat Bendy werkelijk rapporteert voor deze week

Resultaten worden als tabellen getoond.

