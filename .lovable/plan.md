

# DIAG-10: Identificeer de 4 extra posities op dinsdag 24 maart

## Actie
Twee read-only SQL queries uitvoeren via `psql`.

1. **Alle ingeplande diensten op di 24 maart** — 22 diensten met locatie, tijden, gevraagd_aantal, bendy_id en company_id. Vergelijk met Bendy UI's 20 entries.

2. **Groepeer per company_id (hele week)** — Telt diensten en posities per company_id voor alle ingeplande diensten. Als de extra diensten steeds dezelfde company_id delen, is dat het discriminerende filter.

## Doel
Bepalen of de discrepantie voortkomt uit een specifieke company/klant die in Bendy UI gefilterd wordt maar in de API wel meekomt. Geen wijzigingen, alleen lezen.

