

# Plan: Requisitions toevoegen aan cron-job + stale-detectie fixen

## Analyse

Twee problemen gevonden:

1. **Geen automatische requisition sync**: De cron-job (pg_cron Job 41, elke 10 min) synchroniseert alleen clients. Requisitions worden nooit automatisch gesynchroniseerd.

2. **Stale-detectie te agressief**: 34 diensten in Week 14 zijn auto-geannuleerd, maar 6 daarvan hadden open moeten blijven (8 open i.p.v. Bendy's 14). Dit komt waarschijnlijk doordat het open endpoint meer dan 10.000 records retourneert en de hard cap records afkapt — waardoor bestaande diensten als "stale" worden gemarkeerd.

## Stap 1: Requisitions toevoegen aan cron-synchronisatie

**Bestand**: `supabase/functions/bendy-sync/index.ts`

Voeg `sync_requisitions` toe aan de `handleCronSync` functie, zodat requisitions automatisch elke 10 minuten worden gesynchroniseerd met `sync_type: 'full'`.

## Stap 2: Stale-detectie veiliger maken

**Bestand**: `supabase/functions/_shared/bendy-sync-requisitions.ts`

De stale-detectie (Stap 6) markeert diensten als geannuleerd wanneer hun `bendy_id` niet in de API-response voorkomt. Als de hard cap (10.000) wordt bereikt, ontbreken records — wat leidt tot vals-positieve annuleringen.

**Fix**: Sla stale-detectie over als een van de endpoints de hard cap heeft bereikt. Voeg een vlag toe vanuit `fetchAllBendyRecords` die aangeeft of de cap is geraakt:

```typescript
// In stale-detectie (Stap 6):
if (openResult.hitCap || assignedResult.hitCap) {
  logInfo(FUNCTION_NAME, 'STAP 6: Overgeslagen — hard cap bereikt, onvolledige dataset');
} else {
  // bestaande stale-detectie logica
}
```

**Bestand**: `supabase/functions/_shared/bendy-helpers.ts`

Voeg `hitCap: boolean` toe aan het `FetchResult` interface en zet dit op `true` wanneer `allRecords.length >= MAX_TOTAL_RECORDS`.

## Stap 3: Herstel onterecht geannuleerde diensten

Na de fix, trigger een handmatige full sync. Diensten die eerder als stale werden gemarkeerd maar wél in de API voorkomen, worden automatisch hersteld (Bendy is leidend, geannuleerd kan worden hersteld naar open/volledig_bezet).

## Verwacht resultaat
- Requisitions worden elke 10 min automatisch gesynchroniseerd
- Geen valse annuleringen meer door incomplete API-data
- Na 1 sync: open diensten stijgen van 8 → ~14, ingepland van 187 → ~196

## Technische details

| Bestand | Wijziging |
|---|---|
| `bendy-sync/index.ts` | `handleCronSync`: requisitions toevoegen |
| `bendy-helpers.ts` | `FetchResult.hitCap` vlag + logica |
| `bendy-sync-requisitions.ts` | Stap 6: skip als hitCap = true |

