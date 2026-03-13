

# BENDY-REQ-7A: Verwijder diagnostic metadata velden

## Wijzigingen

**Bestand:** `supabase/functions/_shared/bendy-sync-requisitions.ts`

### 1. Verwijder diagData blok (regels 45-53)
Verwijder het volledige `diagData` blok inclusief de variabele declaratie en alle `debug_diag_*` toewijzingen.

### 2. Verwijder `...diagData` spread (regel 478)
Verwijder `...diagData,` uit het metadata object in de sync log update.

### 3. Deploy edge function

