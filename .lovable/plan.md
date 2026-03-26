

# DIAG-8: Ontbrekende ingeplande dienst maandag 23 maart

## Actie
Twee read-only SQL queries uitvoeren via `psql`.

1. **Alle ingeplande diensten op ma 23 maart** — 16 diensten met locatie, tijden, gevraagd_aantal, bendy_id.
2. **Overgeslagen records** — Bendy raw cache records met `date = 2026-03-23` en `status = closed` die NIET als dienst bestaan. Dit onthult de ontbrekende dienst en waarom die is overgeslagen (bijv. ontbrekende sublocation-match).

Geen wijzigingen, alleen lezen.

