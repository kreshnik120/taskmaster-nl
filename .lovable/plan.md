

# Dode Code Analyse — Geverifieerd

Elke entry hieronder is geverifieerd: **nul imports** vanuit actieve code in het hele project.

## Frontend Components (0 imports)

| Bestand | Verificatie |
|---|---|
| `src/components/SystemMonitor.tsx` | 0 imports gevonden |
| `src/components/GlobalOfflineBanner.tsx` | 0 imports gevonden |
| `src/components/UnifiedActionHub.tsx` | 0 imports gevonden |
| `src/components/QuickTimerButton.tsx` | 0 imports gevonden |
| `src/components/UserProfileCard.tsx` | 0 imports gevonden |
| `src/components/ClientSelectionDialog.tsx` | 0 imports gevonden |
| `src/components/SublocationSelectionDialog.tsx` | 0 imports gevonden |
| `src/components/ActiveProcessWidget.tsx` | Alleen geimporteerd door `ProcessTimeline` (zie hieronder) — maar `ActiveProcessWidget` zelf heeft 0 imports |

**Kettenreactie**: `ActiveProcessWidget` importeert `ProcessTimeline`, maar `ActiveProcessWidget` zelf wordt nergens gebruikt. `ProcessTimeline` wordt WEL nog gebruikt door `TaskDetailModal`, dus die blijft. Alleen `ActiveProcessWidget.tsx` is dood.

**Hook**: `useBackendHealth` wordt alleen gebruikt door `GlobalOfflineBanner` (ook dood) — dus ook dood.

## Frontend Page

| Bestand | Verificatie |
|---|---|
| `src/pages/Beschikbaarheid.tsx` | Route in App.tsx redirect naar `/planning?tab=beschikbaarheid`. Pagina zelf wordt NERGENS geimporteerd. De beschikbaarheid-componenten die het gebruikt (`BeschikbaarheidWeekKalender`, etc.) worden WEL nog door Planning.tsx gebruikt — alleen de page-wrapper is dood. |

## Edge Functions (0 aanroepen vanuit frontend EN andere functions)

| Function | Verificatie |
|---|---|
| `auto-send-interview-slots` | 0 aanroepen in src/ of andere edge functions. Code zelf zegt "DEPRECATED". |
| `backfill-embeddings` | 0 aanroepen in src/ of andere edge functions. Code zelf zegt "DEPRECATED: replaced by generate-embedding". |
| `cleanup-test-data` | 0 aanroepen in src/. Alleen self-referencing logs. Utility voor handmatige cleanup — **optioneel** verwijderen. |
| `cleanup-stuck-test-runs` | 0 aanroepen in src/ of andere edge functions. |
| `cleanup-stale-jobs` | 0 aanroepen in src/ of andere edge functions. |
| `cleanup-orchestrator-state` | 0 aanroepen in src/ of andere edge functions. |
| `cleanup-fast-path-patterns` | 0 aanroepen in src/ of andere edge functions. |

**NIET dood** (geverifieerd): `schedule-interview` (gebruikt door orchestrator + handle-application-reply + react-agent), `send-interview-email` (gebruikt door orchestrator), `auto-backfill-orchestrator` (gebruikt door 3 UI components).

## Implementatieplan

### Stap 1: Verwijder 8 dode frontend bestanden
- `SystemMonitor.tsx`
- `GlobalOfflineBanner.tsx`
- `UnifiedActionHub.tsx`
- `QuickTimerButton.tsx`
- `UserProfileCard.tsx`
- `ClientSelectionDialog.tsx`
- `SublocationSelectionDialog.tsx`
- `ActiveProcessWidget.tsx`

### Stap 2: Verwijder 1 dode hook
- `useBackendHealth.ts`

### Stap 3: Verwijder 1 dode page
- `pages/Beschikbaarheid.tsx` (route is al een redirect)

### Stap 4: Verwijder 6 dode edge functions
- `auto-send-interview-slots/`
- `backfill-embeddings/`
- `cleanup-test-data/`
- `cleanup-stuck-test-runs/`
- `cleanup-stale-jobs/`
- `cleanup-orchestrator-state/`
- `cleanup-fast-path-patterns/`

**Totaal: 16 bestanden/directories verwijderen. Geen actieve code wordt geraakt.**

