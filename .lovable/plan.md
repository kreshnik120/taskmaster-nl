

# FIX: UI Requisition Sync draait nog steeds als 'incremental'

## Probleem
De "Requisition Sync Starten" knop in de UI stuurt `sync_type: 'incremental'` (regel 1390 van `BendySync.tsx`). Hierdoor wordt stale-detectie (Stap 6) overgeslagen en blijven ghost-open diensten bestaan.

Bewijs uit de sync log:
- `sync_type: incremental` 
- `debug_stale_marked: 0, debug_stale_checked: 0`

De cron-fix van eerder werkt alleen voor `trigger === 'scheduler'`, niet voor handmatige UI-triggers.

## Oplossing

**Bestand:** `src/pages/BendySync.tsx` — regel 1390

Wijzig `sync_type: 'incremental'` → `sync_type: 'full'` voor de requisition sync knop.

```typescript
// WAS:
body: { action: 'sync_requisitions', tenant: 'citozorg', sync_type: 'incremental' }

// WORDT:
body: { action: 'sync_requisitions', tenant: 'citozorg', sync_type: 'full' }
```

## Verwacht resultaat
- Stale-detectie (Stap 6) activeert: ghost-open diensten worden `geannuleerd` (max 50 per run)
- Deduplicatie-fix wordt toegepast op alle records
- Status-consistentie (Stap 5G) draait mee
- Na 1-2 full syncs: open diensten dalen van 26 → ~14 (Bendy-referentie)

