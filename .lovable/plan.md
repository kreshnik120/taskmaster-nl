

# DATA-FIX-2: Diensten updaten vanuit verse cache — week 13

## Samenvatting
Vier SQL statements uitvoeren om: (1) vastgelopen sync vrijgeven, (2) cache-status checken, (3) diensten-status updaten vanuit cache, (4) resultaat verifiëren. Alleen week 23-29 maart, geen schema-wijzigingen.

## Stappen

### 1. Reset vastgelopen sync
`UPDATE bendy_sync_log SET status='failed', completed_at=NOW(), errors=ARRAY['Handmatig gestopt — DATA-FIX-2'] WHERE status='running'` — maakt sync-lock vrij.

### 2. Check verse cache week 13
Telt `open` vs `closed` requisitions in `bendy_raw_cache` voor 23-29 maart. Vergelijkt met eerdere telling (59 open + 165 closed).

### 3. Update diensten-status
Matcht `diensten.bendy_id` op `bendy_raw_cache.bendy_id` en zet status naar `volledig_bezet` (closed) of `open` (open). Alleen `bron='geimporteerd'`, skip `voltooid`.

### 4. Verificatie
Telt per dag: diensten ingepland, posities ingepland (`SUM(gevraagd_aantal)`), en open diensten. Vergelijkt posities met Bendy UI tellingen.

## Technisch
- Stap 1 en 3 gebruiken UPDATE (insert tool, geen migratie)
- Stap 2 en 4 zijn read-only queries
- Geen wijzigingen buiten week 13, geen schema changes

