

# Plan: Monitoring Agent + Onderzoek Ontbrekende Diensten

## Analyse

De dedup-fix en stale-detectie werken correct. Het nieuwe probleem is **ontbrekende diensten**: 6 open en 9 ingeplande diensten uit Bendy staan niet in onze database. De 88 geannuleerde diensten (547.5 uur) verklaren het urenverschil — sommige hiervan zijn mogelijk onterecht geannuleerd.

## Stap 1: Onderzoek geannuleerde diensten Week 14

Query de 88 geannuleerde diensten om te zien:
- Hoeveel hebben een `bendy_id` dat WEL in de laatste API-batch zat
- Of de stale-detectie te agressief was (records die wél bestaan maar net niet in de batch zaten door paginatie-limieten)

## Stap 2: Controleer of de 8000-record limiet het probleem is

De sync haalt max 8000 records per endpoint. Met 8151 open records overschrijdt dit de limiet — **diensten na record 8000 worden niet opgehaald**. Dit verklaart waarom sommige open diensten ontbreken.

**Fix**: Verhoog de API-limiet of implementeer paginatie voor het open endpoint.

## Stap 3: Voeg een monitoring-query toe aan de BendySync pagina

Voeg een "Week Vergelijking" sectie toe aan de BendySync UI die automatisch na elke sync:
- De status-verdeling per week toont
- Een vergelijking met verwachte Bendy-cijfers maakt
- Afwijkingen groter dan 5% markeert met een waarschuwing

### Technisch
- **Bestand**: `src/pages/BendySync.tsx` — nieuwe sectie onder sync logs
- **Query**: `SELECT status, COUNT(*), SUM(uren) FROM diensten WHERE datum BETWEEN week_start AND week_end GROUP BY status`
- **Edge function**: Mogelijk `bendy-sync-requisitions.ts` — paginatie toevoegen als de 8000-limiet het probleem is

## Verwacht resultaat
- Inzicht in waarom 15 diensten ontbreken
- Automatische monitoring na elke sync
- Fix voor de API-limiet als dat de oorzaak blijkt

