
# STALE LOCK FIX — Auto-reset + Reset Lock knop

## Overzicht
Twee wijzigingen om te voorkomen dat een vastgelopen sync (door timeout/crash) alle volgende syncs blokkeert.

---

## Wijziging 1: Edge Function — Stale lock auto-reset + reset_lock actie

**Bestand:** `supabase/functions/bendy-sync/index.ts`

### 1A. Stale lock detectie in acquireSyncLock() (r216-237)

- Constante `STALE_LOCK_TIMEOUT_MS = 5 * 60 * 1000` toevoegen voor de functie
- `updated_at` toevoegen aan de `.select()` (r223)
- De huidige `if (config.sync_status === 'running') return false` (r229) vervangen door stale-check logica:
  - Lock jonger dan 5 min: return `{ locked: false }` (echt actief)
  - Lock ouder dan 5 min: logWarning + doorlaten (overschrijven)
- `updated_at: new Date().toISOString()` toevoegen aan de `.update()` (r233)

### 1B. Nieuwe actie `reset_lock` in main handler (na r1695, voor r1697)

- Nieuw blok dat `body.action === 'reset_lock'` afvangt
- Haalt config op, zet `sync_status` naar `'idle'`, logt vorige status
- Retourneert success met `previous_status` en `new_status: 'idle'`
- Foutmelding string (r1698) bijwerken met `reset_lock` in de lijst

---

## Wijziging 2: Frontend — Reset Lock knop

**Bestand:** `src/pages/BendySync.tsx`

### 2A. State + handler (na r137)

- `resettingLock` state toevoegen
- `handleResetLock` handler die `action: 'reset_lock'` aanroept

### 2B. Reset knop bij sync_status (r288-291)

- Rode "Reset Lock" knop tonen naast de status tekst, alleen als `config.sync_status === 'running'`

---

## Bestanden die wijzigen

1. `supabase/functions/bendy-sync/index.ts` -- acquireSyncLock() + reset_lock actie
2. `src/pages/BendySync.tsx` -- state, handler, knop

## Technische details

```text
Edge function:
  STALE_LOCK_TIMEOUT_MS = 300000 (5 min)
  acquireSyncLock() selecteert updated_at, checkt staleness bij running status
  .update() schrijft updated_at mee
  reset_lock actie: na update_config, voor actie-validatie
  
Frontend:
  resettingLock state (useState(false))
  handleResetLock() -> supabase.functions.invoke("bendy-sync", { body: { action: "reset_lock" } })
  Button variant="destructive" size="sm" alleen bij sync_status === 'running'

Geen database migraties nodig.
Geen andere bestanden worden gewijzigd.
```
