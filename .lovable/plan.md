

# FIX-TIMEOUT-1: Requisition sync timeout fixen

## Analyse

De sync timed out na 10 minuten. De hoofdloop (regels 128-265) is in-memory en snel. De bottleneck zit waarschijnlijk in:
- **STAP 4B**: Re-fetch van 50.000 diensten na inserts (regel 310-325)
- **STAP 5C**: Pre-fetch toewijzingen in chunks van 500 over alle dienstIds (regel 401-413)
- **STAP 5E**: Individuele fallback inserts bij overlap-fouten (regel 455-475)
- **Auto-cleanup**: Markeert syncs als failed na 10 minuten (regel 58-76)

De in-memory verwerkingsloop zelf hoeft niet gebatcht — die is al snel. Het probleem is de 10-minuten timeout die de sync als "failed" markeert terwijl deze nog draait.

## Wijzigingen

### 1. Timeout verhogen naar 30 minuten
**Bestand**: `supabase/functions/bendy-sync/index.ts` (regels 58-63)

Wijzig `TEN_MINUTES_MS` naar `THIRTY_MINUTES_MS = 30 * 60 * 1000`. Pas ook de error-message aan.

### 2. Timeout verhogen in cleanup-stale-jobs
**Bestand**: `supabase/functions/cleanup-stale-jobs/index.ts`

Dezelfde 10-minuten check daar ook naar 30 minuten verhogen.

### 3. Batch-checkpoints toevoegen aan de hoofdloop
**Bestand**: `supabase/functions/_shared/bendy-sync-requisitions.ts` (regels 128-265)

Voeg na elke 500 records een `logProgress` checkpoint toe zodat de voortgang zichtbaar is in de sync logs:

```typescript
const CHECKPOINT_INTERVAL = 500;
for (let idx = 0; idx < allRecords.length; idx++) {
  const record = allRecords[idx];
  // ... bestaande logica ...
  
  if ((idx + 1) % CHECKPOINT_INTERVAL === 0) {
    await logProgress('3-BATCH', {
      progress: `${idx + 1}/${allRecords.length}`,
      inserts: dienstInserts.length,
      updates: dienstUpdates.length,
      skipped: result.skipped,
    });
  }
}
```

### 4. Deploy edge functions
Na wijzigingen automatisch gedeployed.

## Niet aanraken
- Cache-ophaal logica (STAP 1)
- Delta sync logica
- Database schema
- Stale cleanup logica
- Toewijzingen logica

