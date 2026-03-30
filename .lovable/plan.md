

# S53-FIX-CRON: Frequente sync + pauze_minuten change detection

## Overzicht
Twee wijzigingen: (1) cron interval van 4 uur naar 5 minuten, (2) pauze_minuten opnemen in change detection zodat wijzigingen uit Bendy correct worden overgenomen.

## Stap 1: Cron interval verkorten
**Bestand:** `supabase/config.toml`

Regel met `[functions.bendy-sync]` schedule wijzigen van `"0 */4 * * *"` naar `"*/5 * * * *"`.

## Stap 2A: pauze_minuten toevoegen aan prefetch SELECT
**Bestand:** `supabase/functions/_shared/bendy-sync-requisitions.ts` (regel 113)

```
WAS:  .select('id, bendy_id, status, datum, start_tijd, eind_tijd, sublocation_id')
WORDT: .select('id, bendy_id, status, datum, start_tijd, eind_tijd, pauze_minuten, sublocation_id')
```

## Stap 2B: pauze_minuten change detection toevoegen
**Bestand:** `supabase/functions/_shared/bendy-sync-requisitions.ts` (na regel 247)

Na de bestaande `eind_tijd` vergelijking, toevoegen:
```typescript
if (existingDienst.pauze_minuten !== pauzeMinuten) updateData.pauze_minuten = pauzeMinuten;
```

De variabele `pauzeMinuten` wordt al berekend op regel 192-199, dus geen extra extractie nodig.

## Stap 3: Deploy
Redeploy `bendy-sync` edge function.

## Niet aanraken
- Stale cleanup, lock mechanisme, frontend, andere edge functions

## Verificatie
- Na 5 minuten: nieuwe `sync_requisitions` entry in `bendy_sync_log`
- Pauze wijziging in Bendy → binnen 5 min overgenomen in abcito

