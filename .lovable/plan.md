

# DIAG-4: Extra diensten per dag en locatie

## Actie
Twee read-only SQL queries uitvoeren om de 15 extra diensten te lokaliseren per dag en sublocation. Geen codewijzigingen.

1. **Query 1** — Alle ingeplande diensten op de 5 afwijkende dagen (di, wo, do, za, zo) met locatie, tijden en Bendy API status
2. **Query 2** — Groepering per sublocation over de hele week → identificeert welke locaties de extra diensten genereren

Resultaten worden als tabellen getoond.

