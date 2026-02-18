

# Paginatie-Fix: `limit`/`offset` in plaats van `page[number]`/`page[size]`

## Probleem
De Bendy API gebruikt `limit` en `offset` parameters (bevestigd door Swagger spec), maar de code stuurt `page[number]` en `page[size]` -- die worden genegeerd. Resultaat: altijd max 100 records.

## Wijziging
**Bestand:** `supabase/functions/bendy-sync/index.ts` (regels 180-205)

Drie aanpassingen in `fetchAllBendyRecords()`:
1. Nieuwe regel: `const offset = (page - 1) * PAGE_SIZE;`
2. Parameters: `'limit': String(PAGE_SIZE)` en `'offset': String(offset)` in plaats van `page[number]`/`page[size]`
3. Log-regel: offset toevoegen aan de paginatie-logging

Alle andere functies (syncUsers, syncClients, etc.) gebruiken `fetchAllBendyRecords()` en profiteren automatisch.

## Wat niet wijzigt
- `PAGE_SIZE` (100) en `MAX_PAGES` (50) -- ongewijzigd
- `fetchBendyApi()` -- ongewijzigd
- Stopconditie `records.length < PAGE_SIZE` -- ongewijzigd
- Frontend, database -- geen wijzigingen

## Technische details

```text
Regel 180-185 wordt:
  const offset = (page - 1) * PAGE_SIZE;
  const response = await fetchBendyApi(tenant, endpoint, {
    ...(extraParams || {}),
    'limit': String(PAGE_SIZE),
    'offset': String(offset),
  });

Regel 198 wordt:
  logInfo(..., `Pagina ${page} (offset ${offset}): ${records.length} records ...`);

Na deploy: alle syncs (clients, users, groups) halen nu ALLE pagina's op.
Max: 50 pagina's x 100 = 5.000 records (veiligheidsgrens).
```

