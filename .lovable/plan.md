

# DATA-FIX-7: Bulk fix 120 ontbrekende toewijzingen + sync reset

## Wat
Drie database-operaties om (1) de vastgelopen sync te resetten, (2) ~120 ontbrekende dienst_toewijzingen aan te maken, en (3) te verifiëren.

## Stappen

### 1. Reset vastgelopen sync
Twee UPDATEs via insert tool:
- `bendy_sync_log`: status → `failed` voor alle `running` entries
- `bendy_sync_config`: sync_status → `idle` waar niet al idle

### 2. INSERT 120 ontbrekende toewijzingen
Via insert tool — dezelfde mapping als DATA-FIX-6 maar nu voor alle weken vanaf 1 maart:
```sql
INSERT INTO dienst_toewijzingen (dienst_id, professional_id, status, positie_nr, toewijzing_notities)
SELECT d.id, p.id, 'bevestigd', 1, 'DATA-FIX-7: bulk fix'
FROM diensten d
JOIN bendy_raw_cache brc ON brc.bendy_id = d.bendy_id::text
JOIN bendy_raw_cache cu ON cu.entity_type = 'users'
  AND cu.raw_data->'relationships'->'company'->'data'->>'id' =
      brc.raw_data->'relationships'->'flex_user_company'->'data'->>'id'
JOIN professionals p ON p.bendy_id = cu.bendy_id
WHERE d.datum >= '2026-03-01'
  AND d.bron = 'geimporteerd'
  AND d.status IN ('volledig_bezet','voltooid')
  AND brc.raw_data->'attributes'->>'status' = 'closed'
  AND NOT EXISTS (SELECT 1 FROM dienst_toewijzingen dt WHERE dt.dienst_id = d.id)
```
Verwacht: ~120 rijen (mogelijk minder door overlap-trigger).

### 3. Verificatie
Read-only query: tel ingepland vs nog_zonder_toewijzing per week. Verwacht: nog_zonder_toewijzing ≈ 0.

## Technisch
- Stap 1-2: insert tool (UPDATE/INSERT statements)
- Stap 3: psql read query
- Geen schema-wijzigingen, geen code changes

