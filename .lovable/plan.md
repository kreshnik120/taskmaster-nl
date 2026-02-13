
# BENDY-SYNC-1: Database Migratie voor Bendy Sync Infrastructuur

## Overzicht
Een enkele SQL migratie die 4 nieuwe tabellen, 3 kolom-toevoegingen, indexes, RLS policies, en seed data aanmaakt. Geen code wijzigingen.

## Verificatie (vooraf)
- Alle 5 benodigde tabellen bestaan (organizations, client_organizations, professionals, diensten, user_organizations)
- `bendy_id` kolom bestaat nog NIET op de 3 tabellen
- Bestaande `update_updated_at_column()` trigger functie kan hergebruikt worden (identieke logica)
- Organizations tabel bevat 1 record (id: `550e8400-...`)

## Migratie Inhoud

### Deel 1: 4 Nieuwe Tabellen
1. **bendy_sync_config** -- tenant configuratie met org_id FK, sync status, interval
2. **bendy_sync_log** -- audit trail per sync run met counters en error tracking
3. **bendy_id_mapping** -- Bendy ID naar lokale UUID koppeling met conflict tracking
4. **bendy_raw_cache** -- ruwe JSON:API responses voor debugging

### Deel 2: Kolom Toevoegingen
- `bendy_id TEXT` op `client_organizations`, `professionals`, en `diensten`

### Deel 3: Indexes (13 stuks)
- Lookup indexes op alle nieuwe tabellen
- Partial indexes op bendy_id kolommen (WHERE bendy_id IS NOT NULL)
- Tijdgebaseerde indexes voor log queries

### Deel 4: RLS Policies
- RLS enabled op alle 4 nieuwe tabellen
- SELECT-only policies: gebruikers zien alleen data van hun eigen organisatie (via `user_organizations`)

### Deel 5: Updated_at Triggers
- Hergebruikt bestaande `update_updated_at_column()` functie (niet de nieuwe `update_bendy_updated_at` uit de prompt)
- Triggers op `bendy_sync_config` en `bendy_id_mapping`

### Deel 6: Seed Data
- CitoZorg sync config (disabled, base_url: citozorg.bendy.nl, interval: 15 min)

## Gewijzigde Bestanden
Geen bestanden -- alleen een database migratie via de migration tool.

## Wat er NIET verandert
- Geen TypeScript/React code
- Geen edge functions
- Geen bestaande tabellen, triggers, of policies (behalve de 3 ALTER TABLE ADD COLUMN)
