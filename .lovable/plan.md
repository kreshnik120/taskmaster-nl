

# BENDY-REQ-8A: No-match diagnostiek toevoegen

## Wijzigingen

**Bestand:** `supabase/functions/_shared/bendy-sync-requisitions.ts`

### 1. Diagnostiek collectors initialiseren (voor de 5D loop, ~regel 357)

```typescript
const noMatchSamples: any[] = [];
const noMatchUniqueUsers = new Set<string>();
```

### 2. No-match data verzamelen (regels 368-384)

Bij beide no-match paden (`userBendyId` niet gevonden in fucMap, en `prof` niet gevonden in profMap):
- Voeg de unieke user ID toe aan `noMatchUniqueUsers`
- Voeg een sample toe aan `noMatchSamples` (max 20) met:
  - `bendy_user_id`: het fucId
  - `requisition_id`: bendyId
  - `reason`: welk pad faalde (fucMap of profMap)
  - `user_bendy_id`: indien beschikbaar

### 3. Metadata uitbreiden (regels 456-468)

Voeg toe aan het metadata object:
- `debug_no_match_sample`: `noMatchSamples` (max 20)
- `debug_no_match_unique_users`: `noMatchUniqueUsers.size`
- `debug_no_match_user_ids`: `[...noMatchUniqueUsers].slice(0, 50)`

### 4. Deploy edge function

Geen wijzigingen aan matching-logica. Puur diagnostiek.

