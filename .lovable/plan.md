

# BENDY-REQ-8B: batchInsert professionals met individuele fallback

## Probleem

`batchInsert` in `bendy-helpers.ts` doet chunk inserts (200 records). Bij een constraint violation faalt de hele chunk en worden 0 records teruggegeven — de 59 missende professionals.

## Wijzigingen

### 1. `bendy-sync-users.ts` — Vervang batchInsert door fallback-logica (regels 270-299)

Vervang het huidige `batchInsert` + index-based matching blok door:

```typescript
// Diagnostiek counters
let profBatchOk = 0;
let profFallbackUsed = 0;
let profFallbackCreated = 0;
const profFallbackFailed: any[] = [];

const CHUNK_SIZE = 200;
for (let i = 0; i < proInserts.length; i += CHUNK_SIZE) {
  const chunk = proInserts.slice(i, i + CHUNK_SIZE);
  const insertDataChunk = chunk.map(p => p.insertData);
  
  const { data, error } = await adminClient
    .from('professionals')
    .insert(insertDataChunk)
    .select('id');

  if (!error && data) {
    // Chunk lukte in één keer
    profBatchOk++;
    for (let idx = 0; idx < data.length; idx++) {
      processNewPro(data[idx], chunk[idx]);
    }
  } else {
    // Fallback: individuele inserts via Promise.allSettled
    profFallbackUsed++;
    logWarning(FUNCTION_NAME, `Chunk ${i} failed: ${error?.message} — fallback per record`);
    
    const results = await Promise.allSettled(
      chunk.map(item =>
        adminClient.from('professionals').insert(item.insertData).select('id').single()
      )
    );
    
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      if (r.status === 'fulfilled' && r.value.data?.id) {
        profFallbackCreated++;
        processNewPro(r.value.data, chunk[idx]);
      } else {
        profFallbackFailed.push({
          bendy_id: chunk[idx].bendyId,
          error: r.status === 'rejected' ? String(r.reason) : r.value.error?.message
        });
        result.failed++;
        result.errors.push(`User ${chunk[idx].bendyId}: ${r.status === 'rejected' ? String(r.reason) : r.value.error?.message}`.substring(0, 200));
      }
    }
  }
}
```

Helper functie `processNewPro` (inline of lokale functie) die de bestaande BSN + mapping logica bevat:

```typescript
function processNewPro(newPro: any, original: typeof proInserts[0]) {
  if (original.bsn) {
    bsnWrites.push({ professional_id: newPro.id, bsn_plaintext: original.bsn, updated_at: new Date().toISOString() });
  }
  mappingWrites.push({
    org_id: orgId, tenant, entity_type: 'professional',
    bendy_id: original.bendyId, local_id: newPro.id,
    last_synced_at: new Date().toISOString(), sync_status: 'synced', conflict_data: null,
  });
  result.created++;
}
```

### 2. Diagnostiek metadata toevoegen aan SyncResult

Voeg de 4 debug velden toe aan het `result` object vóór de return:

```typescript
(result as any).debug_prof_batch_ok = profBatchOk;
(result as any).debug_prof_fallback_used = profFallbackUsed;
(result as any).debug_prof_fallback_created = profFallbackCreated;
(result as any).debug_prof_fallback_failed = profFallbackFailed.slice(0, 20);
```

### 3. Deploy edge function

Geen andere bestanden wijzigen. Alleen `bendy-sync-users.ts`.

## Verwacht resultaat

- Professionals tabel groeit van 1427 → ~1486
- Metadata toont welke records via fallback zijn aangemaakt
- Requisition sync no_match daalt van 50 → ~0

