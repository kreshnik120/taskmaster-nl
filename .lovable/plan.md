

# DIAG-3: Identificeer extra ingeplande diensten

## Actie
Twee read-only SQL queries uitvoeren via `psql` om te identificeren welke dagen extra diensten hebben t.o.v. Bendy's weekoverzicht. Geen codewijzigingen.

1. **Query 1** — Alle ingeplande diensten (volledig_bezet + voltooid) met datum, locatie, tijden en bendy_id → volledige lijst
2. **Query 2** — Telling per dag met uren → directe vergelijking met Bendy (ma:17, di:20, wo:19, do:24, vr:20, za:30, zo:20)

Resultaten worden als tabellen getoond.

