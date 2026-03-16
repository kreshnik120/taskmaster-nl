

# BENDY-REQ-10: Verwijder diagnostiek metadata

## Wijzigingen in `bendy-sync-users.ts`

1. **Regel 108-109** — Verwijder `emailMatchCount` en `emailSkippedCount` declaraties
2. **Regel 135** — Verwijder `emailMatchCount++`
3. **Regel 138** — Verwijder `emailSkippedCount++`
4. **Regels 394-395** — Verwijder `(result as any).email_matched` en `(result as any).email_skipped_other_bendy`

Alle functionele code (matching cascade, paginatie, Maps, fallback, `result.skipped++`, `logWarning`) blijft intact.

## Deploy
Redeploy `bendy-sync` edge function.

