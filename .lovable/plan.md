

# FIX-STALE-1: Stale cleanup + status herstel

## Wijzigingen

### 1. Stale cleanup alleen bij full sync (regels 480-499)
Wrap de stale cleanup logica in `if (!isDelta) { ... }`. De `staleStats` variabele staat al buiten de loop (regel 488), dus die blijft beschikbaar voor logProgress.

### 2. Verwijder `geannuleerd` guard bij status update (regel 219)
Verwijder `existingDienst.status !== 'geannuleerd'` uit de conditie zodat diensten die in Bendy actief zijn maar lokaal op geannuleerd staan, worden hersteld. Alleen `voltooid` blijft beschermd.

### 3. SQL migratie: herstel 64 onterecht geannuleerde diensten
```sql
UPDATE diensten
SET status = 'volledig_bezet', updated_at = NOW()
WHERE datum BETWEEN '2026-03-23' AND '2026-03-29'
  AND status = 'geannuleerd'
  AND bendy_id IS NOT NULL
  AND bendy_id IN (
    SELECT bendy_id FROM bendy_raw_cache
    WHERE entity_type = 'requisitions'
  );
```

### 4. Deploy edge function

## Niet aanraken
Diagnostiek, delta fetch, toewijzingen, 90-dagen filter.

