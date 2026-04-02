

# Plan: Duplicaten Definitief Oplossen

## Probleem

Er zijn **15 actieve duplicaat-paren** waarbij een `open` dienst naast een `volledig_bezet` dienst bestaat op exact dezelfde sublocation/datum/tijden. De vorige cleanup-migratie heeft slechts een deel geraakt, en de sync-dedup-logica faalt omdat de check alleen kijkt naar de in-memory `dienstMap` — niet naar de database.

## Stap 1: Database cleanup — alle bestaande duplicaten

SQL migratie die ALLE `open` diensten annuleert waar een `volledig_bezet` equivalent bestaat op dezelfde sublocation+datum+start+eind:

```sql
UPDATE diensten d_open
SET status = 'geannuleerd', updated_at = now()
FROM diensten d_bezet
WHERE d_open.status = 'open' 
  AND d_bezet.status = 'volledig_bezet'
  AND d_open.sublocation_id = d_bezet.sublocation_id
  AND d_open.datum = d_bezet.datum
  AND d_open.start_tijd = d_bezet.start_tijd
  AND d_open.eind_tijd = d_bezet.eind_tijd
  AND d_open.id != d_bezet.id;
```

## Stap 2: Sync-dedup versterken

**Bestand**: `supabase/functions/_shared/bendy-sync-requisitions.ts`

Het huidige probleem: de dedup-check kijkt alleen naar de `dienstMap` (in-memory map van bestaande diensten geladen aan het begin). Maar als de `volledig_bezet` dienst pas later in dezelfde sync-run wordt verwerkt (vanuit het assigned-endpoint), is die nog niet in de map wanneer de `open` versie eerder wordt verwerkt.

**Fix**: Verwerk het **assigned endpoint eerst**, dan het open endpoint. Zo staat de `volledig_bezet` dienst altijd al in de map wanneer de `open` variant wordt gecontroleerd. Daarnaast: voeg een extra database-check toe als fallback.

## Stap 3: Re-deploy en verificatie

Re-deploy edge function, trigger sync, bevestig 0 duplicaten.

## Technisch

| Onderdeel | Wijziging |
|---|---|
| Database migratie | Annuleer alle open duplicaten |
| `bendy-sync-requisitions.ts` | Verwerk assigned vóór open; database-fallback dedup |
| Edge function | Re-deploy |

