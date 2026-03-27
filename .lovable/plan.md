

# DIAG-12: Toewijzingen-gap voor open diensten week 13

## Actie
Twee read-only SQL queries uitvoeren via `psql`.

1. **Toewijzing-status telling** — Telt hoeveel van de 54 open diensten wél een `flex_user_company` relatie hebben in de Bendy cache vs. niet. Verwacht: ~51 met, ~3 zonder.

2. **Detail zonder flex_user** — Toont datum, locatie en tijden van de ~3 diensten die écht open zijn (geen flex_user in cache). Verwacht: overeenkomst met Bendy UI's open posities.

## Doel
Bepalen of de meeste "open" diensten eigenlijk al een toewijzing hebben in Bendy en dus als `volledig_bezet` gemarkeerd zouden moeten worden. Geen wijzigingen.

