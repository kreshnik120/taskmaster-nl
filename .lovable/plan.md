

# DATA-FIX-4: Open diensten corrigeren + sync reset

## Stappen

### 1. Reset vastgelopen sync
Twee UPDATEs via insert tool:
- `bendy_sync_log`: status → `failed` waar status = `running`
- `bendy_sync_config`: sync_status → `idle` waar niet al idle

### 2. Bulk update: alle open → volledig_bezet
UPDATE `diensten` SET status = `volledig_bezet` voor week 23-29 maart, status = `open`, bron = `geimporteerd`. Verwacht: ~54 rijen.

### 3. Drie echte open diensten terugzetten
UPDATE `diensten` SET status = `open` voor de 3 specifieke diensten:
- vr 27 16:00-20:00
- za 28 08:00-15:30  
- zo 29 Knegselstraat 25

### 4. Verificatie
Read-only query: tel open vs ingepland. Verwacht: open = 3.

## Technisch
- Stap 1-3: insert tool (data updates)
- Stap 4: psql read query
- Geen schema-wijzigingen, geen code changes

