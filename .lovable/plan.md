

# BENDY-TEST: Bendy Sync Test & Beheer Pagina

## Overzicht
Admin-only pagina voor het testen en beheren van de Bendy sync engine. Bevat 4 onderdelen: edge function uitbreiding (update_config actie), nieuwe pagina, route, en sidebar item.

## Wijziging 1 -- `supabase/functions/bendy-sync/index.ts`

### BendySyncRequest interface bijwerken (regel 379-383)
Voeg `update_config` toe als actie en `enabled` als optioneel veld:
```text
interface BendySyncRequest {
  action: 'sync_clients' | 'update_config';
  tenant?: string;
  sync_type?: 'full' | 'incremental';
  enabled?: boolean;
}
```

### Actie-routing uitbreiden (regel 640-642)
Vervang de enkele `if (body.action !== 'sync_clients')` check door:
1. Eerst `update_config` actie afhandelen: haalt config op via tenant, toggle enabled, return resultaat
2. Dan onbekende acties afvangen met bijgewerkte foutmelding die beide beschikbare acties noemt

De `update_config` actie:
- Haalt `bendy_sync_config` op voor de gevraagde tenant
- Toggle `enabled` of zet op expliciet meegegeven waarde (`body.enabled`)
- Logt de wijziging met userId
- Retourneert `{ tenant, enabled }` als bevestiging

## Wijziging 2 -- Nieuw bestand: `src/pages/BendySync.tsx`

Admin pagina met teal contextColor en Apple Glass Morphism design. Gebruikt `PageContainer` en `PageHero` consistent met de rest van de app.

### Data ophalen
- GET status via `fetch()` naar `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bendy-sync` (geen auth nodig)
- Auto-refresh elke 30 seconden via `useEffect` + `setInterval`
- Handmatig refreshen via "Ververs" knop in PageHero

### Secties (van boven naar beneden)

1. **PageHero** -- "Bendy Sync Beheer" met RefreshCw icon + "Ververs" knop rechts

2. **Config Card** -- Sync configuratie overzicht:
   - Tenant naam, enabled/disabled badge (groen/grijs)
   - Sync status (idle/running/error)
   - Laatste sync timestamp, error count + message
   - Toggle knop via `supabase.functions.invoke('bendy-sync', { body: { action: 'update_config', enabled: !current } })`

3. **3 KPI Cards** (grid-cols-3):
   - "Gekoppeld" (total_synced) -- emerald variant
   - "Wacht op review" (total_pending) -- amber variant
   - "In cache" (total_cached) -- teal variant

4. **Actie Card** -- "Sync Nu Starten":
   - Knop "Client Sync Starten" met RefreshCw icon
   - Loading spinner tijdens sync
   - Inline resultaat na sync (fetched/updated/skipped/failed)
   - Via `supabase.functions.invoke('bendy-sync', { body: { action: 'sync_clients', tenant: 'citozorg', sync_type: 'full' } })`

5. **Sync Logs Tabel** -- Laatste 20 runs:
   - Kolommen: Datum, Type, Entity, Status (badge), Opgehaald, Bijgewerkt, Overgeslagen, Mislukt, Duur
   - Status badges: success=groen, partial=amber, failed=rood, running=blauw

### States
- Loading states op alle knoppen
- Toast bij succes/fout
- Error state bij GET failure

## Wijziging 3 -- `src/App.tsx`

- Import `BendySync` na de Planning import (regel 29)
- Route `/bendy-sync` toevoegen na `/facturatie/:id` route (regel 116)

## Wijziging 4 -- `src/components/AppSidebar.tsx`

- Sidebar item "Bendy Sync" in de Beheer groep, na "Gebruikers"
- Icon: RefreshCw (al geimporteerd)
- `requiresAdmin: true` -- alleen zichtbaar voor admins
- URL: `/bendy-sync`

## Geen wijzigingen aan
- Bestaande sync logica in bendy-sync (OAuth2, fetchBendyApi, syncClients, lock mechanisme)
- Geen database migraties
- Geen andere pagina's of componenten

