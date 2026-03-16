

# DELTA-SYNC-4: pg_cron scheduler

## Aanpak

SQL migratie aanmaken (via insert tool, niet migration tool — bevat project-specifieke URL en key).

Patroon volgt bestaande cron jobs: hardcoded URL + anon key in headers.

### SQL

1. Verwijder bestaande jobs (indien aanwezig) via `cron.unschedule`
2. **bendy-delta-sync-10min** (`*/10 * * * *`): POST naar `/functions/v1/bendy-sync` met `{"trigger": "scheduler", "sync_type": "incremental"}`
3. **bendy-full-sync-nightly** (`0 3 * * *`): POST naar `/functions/v1/bendy-sync` met `{"trigger": "scheduler", "sync_type": "full"}`

Headers: hardcoded URL `https://oelmsmcgryeoryhonexw.supabase.co` + anon key (zoals alle bestaande cron jobs in dit project).

Geen UI wijzigingen, geen edge function wijzigingen.

