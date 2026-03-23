

# Skip-diagnostiek voor requisition sync

## Backend: `supabase/functions/_shared/bendy-sync-requisitions.ts`

### 1. `skipDiag` object toevoegen (na regel 101)
Tracking object met tellers voor sublocation_miss, datum_ontbreekt, tijd_ontbreekt, missing_client_ids array, en bendy_status_verdeling.

### 2. Status-verdeling tellen (na regel 107)
Tel `attrs.status` per record in `skipDiag.bendy_status_verdeling`.

### 3. Sublocation-skip verrijken (regel 118-128)
Verhoog `skipDiag.sublocation_miss` en verzamel `clientBendyId|name|date` in `missing_client_ids` (max 50).

### 4. Datum/tijd-skip verrijken (regel 172-176)
Tel `datum_ontbreekt` en `tijd_ontbreekt` apart, voeg waarden toe aan error message.

### 5. Diagnostiek opslaan (regel 467-490)
- Voeg `SKIP_DIAG:${JSON.stringify(skipDiag)}` toe aan `result.errors`
- Voeg `skip_diagnostiek: skipDiag` toe aan metadata object

### 6. Deploy edge function

## Frontend: `src/pages/BendySync.tsx`

### 7. Interface uitbreiden (regel 117-127)
Voeg `SkipDiag` interface toe en `skip_diag?: SkipDiag` aan `SyncResult`.

### 8. Polling: skip_diag uit errors array lezen (regel 636-648)
Lees uit `log.errors` array, zelfde patroon als `TOEWIJZINGEN_STATS:`:
```typescript
const diagEntry = log.errors?.find((e: string) => typeof e === 'string' && e.startsWith('SKIP_DIAG:'));
if (diagEntry) {
  try {
    result.skip_diag = JSON.parse(diagEntry.replace('SKIP_DIAG:', ''));
  } catch { /* ignore */ }
}
```

### 9. UI: diagnostiek-blok tonen (na toewijzingen stats)
Amber-styled blok met:
- Grid: sublocation_miss, datum_ontbreekt, tijd_ontbreekt
- Badges: bendy_status_verdeling
- Collapsible: missing_client_ids lijst

## Niet aanraken
- mapStatus, sublocation matching, toewijzingen-sync, bestaande sync flows

