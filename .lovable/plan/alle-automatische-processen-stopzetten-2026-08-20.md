# Alle automatische processen stopzetten

## Wat er nu automatisch draait

In de database staan **21 actieve geplande taken** (cron jobs) die zelfstandig edge functions aanroepen. De belangrijkste:

| Frequentie | Taak |
|---|---|
| elke 2 min | `auto-generate-embeddings` |
| elke 5 min | `master-scheduler-autonomous`, `ai-agent-orchestrator` (2x), `auto-restart-backfill`, `ultra-knowledge-graph` |
| elke 10 min | `bendy-delta-sync-10min`, `system-health-monitor` |
| elke 20/30/35 min | `data-quality-auditor`, `smart-deduplicator`, `source-validator` |
| dagelijks | `bendy-full-sync-nightly`, `meta-orchestrator`, `synapse-pruner`, `professional-enricher`, `cleanup-deleted-knowledge`, `monitor-document-expiry`, `retroactive-training-evaluator`, `ultra-daily-report` |
| wekelijks | `invoke-mega-forecast-generator` |

## Aanpak

Alle 21 taken worden **op inactief gezet** (niet verwijderd). Ze blijven met hun volledige definitie in de database staan, zodat je ze later met één handeling weer kunt aanzetten — los van elkaar of allemaal tegelijk.

Concreet:

1. Een database-migratie zet `active = false` voor elke taak in `cron.job`.
2. Lopende sync-locks van Bendy worden vrijgegeven, zodat er geen taak blijft hangen op de status "running".
3. Verificatie: query bevestigt dat er 0 actieve taken over zijn.

Wat blijft werken: alles wat je zelf in de app aanklikt (handmatige sync, facturen genereren, AI-chat). Alleen de zelfstandig startende achtergrondtaken stoppen.

Wat stopt: automatische Bendy-synchronisatie (data veroudert vanaf nu tot je handmatig synct), AI-leer/opschoontaken, monitoring en notificaties over verlopende documenten.

## Terugdraaien

Later weer aanzetten gebeurt met dezelfde methode omgekeerd (`active = true`), per taak of in één keer.

## Technisch

| Onderdeel | Wijziging |
|---|---|
| Database migratie | `UPDATE cron.job SET active = false` voor alle 21 jobs (via `cron.alter_job`) |
| Bendy sync-state | Openstaande `running` locks resetten naar `idle`/`failed` |
| Verificatie | `SELECT count(*) FROM cron.job WHERE active` moet 0 zijn |

Geen wijzigingen in frontend-code of edge functions — die blijven ongewijzigd en inzetbaar voor handmatig gebruik.
