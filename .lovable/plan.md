

# 90-dagen fallback filter voor full requisition sync

## Huidige situatie
Wijzigingen 1-3 zijn **al geïmplementeerd** — `capturedLastSyncAt` wordt al vastgelegd (regel 616) en meegegeven aan `syncRequisitions` (regel 628) en `syncUsers` (regel 624). Delta mode werkt dus al.

## Enige ontbrekende wijziging: Wijziging 4

### `supabase/functions/_shared/bendy-sync-requisitions.ts`

**Na regel 41**: Voeg `fullSyncCutoff` berekening toe (90 dagen terug) wanneer het geen delta sync is.

**Regels 64-66 aanpassen**: Verander `const` naar `let`, filter records ouder dan 90 dagen bij full sync, en log hoeveel records gefilterd zijn.

```text
WAS:
  const openRecords = openResult.records;
  const assignedRecords = assignedResult.records;
  const allRecords = [...openRecords, ...assignedRecords];

WORDT:
  let openRecords = openResult.records;
  let assignedRecords = assignedResult.records;
  if (fullSyncCutoff) {
    const cutoff = fullSyncCutoff.split('T')[0];
    openRecords = openRecords.filter(r => !r.attributes?.date || r.attributes.date >= cutoff);
    assignedRecords = assignedRecords.filter(r => !r.attributes?.date || r.attributes.date >= cutoff);
    logInfo(...);
  }
  const allRecords = [...openRecords, ...assignedRecords];
```

### Deploy
Deploy `bendy-sync` edge function na de wijziging.

## Niet aanraken
- `bendy-sync/index.ts` (al correct)
- Delta fetch functies, mapStatus, toewijzingen, diagnostiek

