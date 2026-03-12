

# BENDY-REQ-CLEANUP-v2: Batch-per-call cleanup

## Probleem
De PL/pgSQL functie verwijdert alle ~70k duplicaten in één RPC call → edge function timeout.

## Oplossing: 3 wijzigingen

### 1. Database migratie (nieuw)
`CREATE OR REPLACE FUNCTION cleanup_diensten_duplicates` — verwijdert slechts **1 batch** per aanroep (geen LOOP), default batch_size=2000. Maakt UNIQUE index alleen aan als er 0 duplicaten resteren.

### 2. Edge function (`supabase/functions/bendy-sync/index.ts`)
Regel 2497: `batch_size` verlagen van 5000 naar 2000 (match met DB functie default).

### 3. Frontend (`src/pages/BendySync.tsx`)
**onClick handler** (regels 1299-1316): Vervangen door een `while (remaining > 0)` loop die herhaaldelijk de edge function aanroept. Elke iteratie update `cleanupResult` met voortgang (`total_deleted`, `duplicates_remaining`).

**Button tekst** (regels 1319-1325): Toont live voortgang tijdens cleanup ("2000 verwijderd, 68000 resterend"), succes-status, of "onderbroken — klik opnieuw" als de loop faalde.

**disabled conditie** (regel 1298): Aanpassen zodat de knop opnieuw klikbaar is als cleanup onderbroken werd (`cleanupResult` bestaat maar `unique_index_created` is false).

### Niet aangeraakt
- Edge function action routing (blijft identiek)
- Andere sync functies, logProgress, andere pagina's

