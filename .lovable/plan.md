

# Plan: Trigger Full Bendy Sync + Vergelijk Week 14

## Stap 1: Trigger volledige Bendy sync
Roep de `bendy-sync` edge function aan met `sync_type: 'full'` en `entity_type: 'requisitions'` via `curl_edge_functions`. Dit activeert:
- De deduplicatie-fix (assigned > open bij overlap)
- Stale-detectie (Stap 6) voor ghost-open diensten
- Status-consistentie (Stap 5G)

## Stap 2: Vergelijk Week 14 cijfers
Na de sync, query de database voor Week 14 (30 maart – 5 april 2026):
- `SELECT status, COUNT(*), SUM(uren)` grouped by status
- Vergelijk met Bendy's cijfers: **14 open**, **196 ingepland**, **1388.75 uur**

## Stap 3: Rapporteer verschil
Presenteer een voor/na vergelijking met de Bendy-referentiecijfers.

## Technisch
- **Edge function call**: `POST /bendy-sync` met body `{"sync_type": "full", "entity_type": "requisitions"}`
- **DB query**: `SELECT status, COUNT(*), SUM(EXTRACT(EPOCH FROM (eind_tijd - start_tijd))/3600) FROM diensten WHERE datum BETWEEN '2026-03-30' AND '2026-04-05' GROUP BY status`

