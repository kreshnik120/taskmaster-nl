

# BENDY-REQ-9B: Verifieer professional sync + verwijder fallback diagnostiek

## Stap 1 — Verificatie
Draai een Professional Sync via de UI en controleer dat mislukt=0, aangemaakt=0.

## Stap 2 — Cleanup in `bendy-sync-users.ts`

### Verwijder regels 271-274 (counter/array declaraties):
```typescript
let profBatchOk = 0;
let profFallbackUsed = 0;
let profFallbackCreated = 0;
const profFallbackFailed: any[] = [];
```

### Verwijder regels 328-331 (metadata output):
```typescript
(result as any).debug_prof_batch_ok = profBatchOk;
(result as any).debug_prof_fallback_used = profFallbackUsed;
(result as any).debug_prof_fallback_created = profFallbackCreated;
(result as any).debug_prof_fallback_failed = profFallbackFailed.slice(0, 20);
```

### Pas fallback-pad aan (regels 304, 316, 320):
- Verwijder `profFallbackUsed++` (regel 304)
- Verwijder `profFallbackCreated++` (regel 316)
- Verwijder `profFallbackFailed.push(...)` (regel 320) — behoud `result.failed++` en `result.errors.push()`

### Verwijder `profBatchOk++` (regel 299)

### BEHOUD:
- Chunk insert logica (CHUNK_SIZE=200)
- Promise.allSettled fallback bij chunk failure
- `processNewPro` helper
- `result.failed++` en `result.errors.push()` in het error-pad
- `logWarning` bij chunk failure

## Stap 3 — Deploy edge function

