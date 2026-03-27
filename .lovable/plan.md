

# FIX-SYNC-1: Sync herstarten en status-discrepantie oplossen

## Diagnose-resultaat

De user's aanname was **onjuist** — de code haalt al BEIDE endpoints op (`requisitions/open` + `requisitions/assigned`). Bewijs: de succesvolle syncs van 25 maart tonen `bendy_status_verdeling: {"open":221,"closed":602}` = 823 totaal.

**De echte oorzaak van het probleem:**
1. De edge function timeout was 60s (nu gefixed naar 300s)
2. Na de timeout-failures is `bendy_sync_config.sync_status` blijven hangen op `running`
3. De cron skipt alle nieuwe syncs omdat hij denkt dat er nog een loopt
4. Resultaat: er is sinds 25 maart geen sync meer geweest — 2 dagen stale data

## Plan (2 stappen)

### Stap 1 — Reset sync config status
SQL update op `bendy_sync_config`: zet `sync_status` terug naar `idle`. Dit maakt de cron-lock vrij zodat de volgende cron-trigger (elke 10 min) weer een sync start.

```sql
UPDATE bendy_sync_config
SET sync_status = 'idle', updated_at = NOW()
WHERE sync_status = 'running';
```

### Stap 2 — Verifieer na 10 minuten
Check of er een succesvolle sync is gekomen met `records_fetched > 0` en status `success`. De diensten-statussen worden dan automatisch bijgewerkt door de bestaande logica (regels 217-233: `mapStatus` zet `closed` → `volledig_bezet`).

## Geen code-wijzigingen nodig
De sync-code is correct. Alleen de database-status moet gereset worden.

