

# BendySync Polling Fix — HTTP 202 Achtergrond-sync

De backend retourneert nu `202 Accepted` met `{ status: "accepted", sync_log_id: "..." }` in plaats van directe resultaten. De frontend moet hierop reageren met een polling-mechanisme.

## Wijzigingen in `src/pages/BendySync.tsx`

### A. Nieuwe state variabelen (na regel 137)
- `pollingSyncLogId` — houdt het sync_log_id bij dat we polled
- `pollingAction` — welke sync actie actief is (`sync_clients`, `sync_users`, `sync_documents`)

### B. Polling useEffect (na regel 163)
- Pollt elke 3 seconden de GET status endpoint
- Zoekt in `recent_logs` naar het log met het bewaarde `sync_log_id`
- Wanneer `status !== 'running'`: vult het resultaat in, stopt spinner, toont success toast
- Timeout na 5 minuten: stopt polling, toont error toast, reset spinner

### C. handleSync (Client Sync) — regels 207-227
- Bij `data.data.status === 'accepted'`: toast.info + start polling (spinner blijft draaien)
- Anders: bestaand gedrag (direct resultaat)
- `finally { setSyncing(false) }` verwijderd — spinner stopt pas na polling-resultaat

### D. handleUserSync (Professional Sync) — regels 229-249
- Zelfde patroon als handleSync maar voor `sync_users`
- `finally { setSyncingUsers(false) }` verwijderd

### E. Document Sync onClick (regels 707-726)
- Zelfde patroon als handleSync maar voor `sync_documents`
- `finally { setSyncingDocs(false) }` verwijderd

### F. Knopteksten tonen polling-status
- **Client** (regel 648): "Sync draait op achtergrond..." / "Verbinden..."
- **Professional** (regel 683): idem
- **Document** (regel 733): idem

## Verificatie
1. Klik op sync knop -> blauwe info-toast "... gestart op de achtergrond..."
2. Knoptekst: "Sync draait op achtergrond..." met spinner
3. Na voltooiing: groene toast met numeriek resultaat (geen "undefined")
4. Resultaat-grid toont correcte aantallen
5. Na 5 min zonder resultaat: rode timeout-toast, spinner stopt

