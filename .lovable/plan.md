

# DIAG-7: Vind het filter dat Bendy UI toepast

## Actie
Vier read-only SQL queries uitvoeren via `psql` om te ontdekken welk veld in de Bendy raw data het verschil verklaart tussen de 155 diensten in Bendy UI en de 224 records uit de API.

### Queries

1. **Alle attribute-velden** — `jsonb_object_keys` op `raw_data->'attributes'` voor requisitions in de cache. Zoekt naar velden als `published`, `state`, `visibility`, `number_of_people`.

2. **Alle relationship-types** — `jsonb_object_keys` op `raw_data->'relationships'`. Identificeert alle beschikbare relaties.

3. **Open diensten detail (eerste 10)** — Alle attributen van open diensten, inclusief `number_of_people`, `published`, `state`, `company_id`, `client_id`. Vergelijk de 5 die in Bendy UI staan met de 50 extra.

4. **Maandag ingepland detail** — Alle 16 ingeplande diensten op 23 maart met API-velden. Bendy UI toont er 17 — welke ontbreekt?

### Doel
Het discriminerende veld vinden dat verklaart waarom Bendy UI minder diensten toont dan de API retourneert. Geen wijzigingen.

