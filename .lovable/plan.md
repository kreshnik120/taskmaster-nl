

# DIAG-11: Onderzoek vastgelopen requisition sync

## Bevindingen

### 1. Edge Function Timeout: **60 seconden (default!)**
De `bendy-sync` functie heeft **geen** `timeout` in `supabase/config.toml`. Het Supabase default is 60 seconden. Dit is de root cause: de sync wordt na 60s afgebroken door Supabase, maar de auto-cleanup markeert pas na 30 minuten als failed — waardoor de sync "hangt" in `running` status.

Andere functies zoals `backfill-embeddings` en `knowledge-graph-builder` hebben wél `timeout = 300`.

### 2. Na "3-VERWERKT" komen zware DB-operaties
Na regel 292 (`3-VERWERKT` checkpoint) volgen:
- **STAP 4**: Batch upserts diensten (chunks van 200)
- **STAP 4B**: Re-fetch van 50.000 diensten (`limit(50000)`)
- **STAP 5A-5C**: Paginated fetch van users cache, professionals, en bestaande toewijzingen
- **STAP 5D-5E**: Toewijzingen insert met fallback
- **STAP 6**: Stale cleanup

Dit zijn tientallen database round-trips die samen ver over 60 seconden uitkomen.

### 3. Logs bevestigen
De edge function logs tonen alleen `booted` en `shutdown` — geen error, geen completion. Dit is typisch voor een Supabase-enforced timeout (de functie wordt gewoon gekilld).

## Fix (1 wijziging)

**`supabase/config.toml`**: Voeg `timeout = 300` toe aan de `[functions.bendy-sync]` sectie (5 minuten, maximaal toegestaan).

```toml
[functions.bendy-sync]
verify_jwt = false
timeout = 300
```

Dit geeft de sync 5 minuten per invocatie in plaats van 60 seconden. De 30-minuten auto-cleanup blijft als vangnet.

