

# DATA-FIX-1: Reset diensten status op basis van Bendy data

## Actie
Vier SQL queries uitvoeren in volgorde via database tooling. Geen codewijzigingen.

1. **Query 1** — Reset status van alle diensten deze week op basis van actuele Bendy raw_data (open → open, closed → volledig_bezet). Beschermt `voltooid`.
2. **Query 2** — Markeer diensten die niet meer in Bendy staan als `geannuleerd`.
3. **Query 3** — Verificatie: status-verdeling deze week ophalen.
4. **Query 4** — Reset `last_incremental_sync_at` naar NOW() zodat volgende sync correct werkt.

Verwacht resultaat Query 3: ~146 volledig_bezet, ~8 open, rest geannuleerd.

