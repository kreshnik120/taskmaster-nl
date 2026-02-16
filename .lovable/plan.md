
# BENDY-DIAG: Diagnostiek & Pending Review

## Overzicht
Voegt diagnostiek queries toe aan het GET status endpoint en toont deze in twee nieuwe secties op de Bendy Sync pagina: een "Data Kwaliteit" analyse card en een "Wacht op Review" tabel met alle pending mappings.

## Wijziging 1 -- `supabase/functions/bendy-sync/index.ts`

### handleStatusCheck() uitbreiden (regels 414-428)

Na de bestaande cache count query (r416) en voor de return (r418), 4 extra queries toevoegen:

1. **Config org_id + organisatienaam** -- Join `bendy_sync_config` met `organizations` voor citozorg tenant
2. **Lokale client counts** -- Tel `client_organizations` voor die org_id, totaal en met kvk_nummer
3. **Pending mappings** -- Haal max 100 pending client mappings op met conflict_data
4. **Bendy KvK stats** -- Bereken in code hoeveel pending mappings een KvK-nummer hebben in conflict_data

Het return object krijgt twee nieuwe velden:
- `diagnostics`: object met config_org_id, config_org_name, local_clients_total, local_clients_with_kvk, bendy_clients_with_kvk, bendy_clients_without_kvk
- `pending_mappings`: array met id, bendy_id, company_name, kvk, town, created_at

## Wijziging 2 -- `src/pages/BendySync.tsx`

### 2a. StatusData interface uitbreiden (r43-51)
Voeg optionele `diagnostics` en `pending_mappings` velden toe aan de interface.

### 2b. Variabelen toevoegen (na r97)
```text
const diagnostics = statusData?.diagnostics;
const pendingMappings = statusData?.pending_mappings || [];
```

### 2c. "Data Kwaliteit" card (na KPI cards r254, voor Sync Action r256)
Twee-koloms layout:
- Links: Config org_id + naam, lokale clients count met KvK percentage
- Rechts: Bendy clients count met KvK percentage
- Rode waarschuwingsblokken bij 3 scenario's: geen lokale clients, geen lokale KvK-nummers, geen Bendy KvK-nummers

### 2d. "Wacht op Review" tabel (na Sync Logs tabel r338, voor sluitende div r339)
Tabel met kolommen: Bendy ID, Bedrijfsnaam, KvK-nummer (of "ontbreekt" in italic), Plaats, Ontvangen datum. Maximaal 100 rijen. Alleen zichtbaar als er pending mappings zijn.

## Geen andere wijzigingen
- Geen database migraties
- Geen routing of sidebar wijzigingen
- Sync logica blijft identiek
