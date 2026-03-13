

# BENDY-REQ-5B-FIX-6: Paginated cache users fetch

## Probleem
De `.limit(50000)` werkt niet — Supabase kapt af op 1000 rijen. Hierdoor worden ~481 users gemist.

## Wijziging
**Bestand:** `supabase/functions/_shared/bendy-sync-requisitions.ts`, regels 291-296

Vervang de enkele query:
```typescript
const { data: cachedUsers } = await adminClient
  .from('bendy_raw_cache')
  .select('bendy_id, raw_data')
  .eq('org_id', orgId)
  .eq('entity_type', 'users')
  .limit(50000);
```

Door paginated fetch (identiek patroon als de professionals fetch op regel 318-331):
```typescript
const cachedUsers: any[] = [];
let cacheOffset = 0;
const CACHE_PAGE = 1000;
while (true) {
  const { data: chunk } = await adminClient
    .from('bendy_raw_cache')
    .select('bendy_id, raw_data')
    .eq('org_id', orgId)
    .eq('entity_type', 'users')
    .range(cacheOffset, cacheOffset + CACHE_PAGE - 1);
  if (!chunk || chunk.length === 0) break;
  cachedUsers.push(...chunk);
  if (chunk.length < CACHE_PAGE) break;
  cacheOffset += CACHE_PAGE;
}
```

De rest van de code (for-loop, fucMap, metadata) blijft ongewijzigd.

Deploy edge function na wijziging.

