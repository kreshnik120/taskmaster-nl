

# BENDY-REQ-5A: syncRequisitions() — Diensten Importeren

## Overzicht

Nieuwe `syncRequisitions()` functie in de edge function + bijbehorende sync knop in de frontend. Volgt exact het bestaande patroon van syncUsers/syncDocuments.

## Wijzigingen

### 1. Edge Function — `supabase/functions/bendy-sync/index.ts`

**A. Action type uitbreiden (regel 1637)**
```
'sync_clients' | 'sync_users' | 'sync_requisitions' | 'update_config'
```
Opmerking: `sync_documents` ontbreekt in het huidige type maar wordt wel gebruikt — voegen we ook toe.

**B. Action validatie (regel 2195)**
`sync_requisitions` toevoegen aan de allowed actions check.

**C. Entity type voor sync_log (regel 2233)**
Case toevoegen: `capturedAction === 'sync_requisitions' ? 'requisitions_open'`

**D. Action routing (regel 2254-2261)**
```
if (capturedAction === 'sync_requisitions') {
  result = await syncRequisitions(bgAdminClient, tenant, orgId, syncType);
}
```

**E. `syncRequisitions()` functie (na `syncDocuments`, vóór REQUEST TYPES)**
Exact zoals opgegeven in het verzoek:
- Haalt open + assigned requisitions op via `fetchAllBendyRecords`
- Pre-fetcht bestaande diensten met bendy_id en sublocations met bendy_id
- In-memory verwerking: cache writes, dienst inserts/updates, mapping writes
- Client ID → sublocation_id mapping; skips als sublocation niet gevonden (pending mapping)
- Tijd extractie uit datetime strings, pauze berekening, status mapping, dienst_type afleiding
- Updates alleen als velden gewijzigd EN status niet geannuleerd/voltooid
- Batch DB writes: cache upsert, parallel updates, batch insert, mapping upsert
- Na insert: local_ids in mappings bijwerken met echte IDs

### 2. Frontend — `src/pages/BendySync.tsx`

**A. State (bij regel 139)**
```tsx
const [syncingReqs, setSyncingReqs] = useState(false);
const [reqSyncResult, setReqSyncResult] = useState<SyncResult | null>(null);
```

**B. Polling handler (regel 637-641)**
Extra case:
```tsx
} else if (pollingAction === 'sync_requisitions') {
  setReqSyncResult(result);
  setSyncingReqs(false);
  toast.success(`Requisition sync voltooid: ${log.records_fetched} diensten opgehaald`);
}
```

En bij timeout cleanup (regel 660):
```tsx
if (pollingAction === 'sync_requisitions') setSyncingReqs(false);
```

**C. UI — Nieuwe Card na Document Sync Card (na regel 1272)**
Requisition Sync Card met dezelfde structuur als Document Sync:
- Titel "Requisition Sync" met Calendar/Play icoon
- "Requisition Sync Starten" knop → stuurt `{ action: 'sync_requisitions' }`
- Resultaat grid (opgehaald/aangemaakt/bijgewerkt/overgeslagen/mislukt)

## Velden die NIET worden gezet
- `aangemaakt_door` — geen user context in sync
- `tarief_per_uur`, `werkvorm`, `kleur` — niet beschikbaar uit Bendy
- `vereiste_certificeringen` — apart veld, niet uit requisitions

## Geen database wijzigingen nodig
De `diensten` tabel heeft al `bendy_id`, `bron`, en alle benodigde kolommen.

