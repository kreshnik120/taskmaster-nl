

# BENDY-FIX-8b: Professional Sync + User Fill Rate Analyse

## Overzicht
Professional sync toevoegen aan de bendy-sync edge function, inclusief fill rate analyse voor users. 2 bestanden worden gewijzigd.

## Wijziging 1 -- `supabase/functions/bendy-sync/index.ts`

**1a** Commentaar bovenaan (regel 8): "Fase 1: Alleen clients" wordt "Fase 1: Clients + Fase 2: Professionals".

**1b** Nieuwe `buildFullName` helper na `buildContactName` (regel 284): Zelfde patroon maar met `firstname`, `middlename`, `lastname`.

**1c** Nieuwe `syncUsers` functie na `syncClients` (regel 686, voor FIELD FILL RATE ANALYSIS): Volgt hetzelfde patroon als syncClients maar eenvoudiger:
- Haalt `/api/v2/users` op via `fetchAllBendyRecords`
- Cachet in `bendy_raw_cache` met `entity_type: 'users'`
- Matcht op 2 niveaus: bendy_id (match 1), email case-insensitive (match 2)
- Bij match: update `professionals` tabel (full_name, telefoonnummer), registreer mapping met `entity_type: 'professional'`
- Geen match: registreer als pending in `bendy_id_mapping`

**1d** `BendySyncRequest` interface (regel 748): `'sync_users'` toevoegen aan action union type.

**1e** Actie routing (regel 1175-1177): `sync_users` accepteren naast `sync_clients`.

**1f** Sync uitvoering (regel 1213-1221): Dynamisch entity_type en sync functie kiezen op basis van `body.action`.

**1g** `handleStatusCheck` uitbreiden (na regel 896): User raw cache ophalen, `userFieldFillRates` berekenen, user statistieken tellen (synced/pending/cached).

**1h** Diagnostics response (na regel 926): `user_statistics` en `user_field_fill_rates` toevoegen.

## Wijziging 2 -- `src/pages/BendySync.tsx`

**2a** `Users` icoon importeren uit lucide-react (regel 2).

**2b** Diagnostics interface (na regel 77): `user_statistics` en `user_field_fill_rates` properties toevoegen.

**2c** Nieuwe state variabelen (na regel 121): `syncingUsers` en `userSyncResult`.

**2d** Nieuwe `handleUserSync` handler (na regel 186): Roept `bendy-sync` aan met `action: 'sync_users'`.

**2e** Na de "Sync Nu Starten" card (na regel 537): Nieuwe "Professional Sync" card met:
- User statistieken badges (cached, gekoppeld, pending)
- "Professional Sync Starten" knop
- Resultaat tellers (5 KPIs)

**2f** Na de Bendy Velden Analyse card (na regel 511): User velden tabel met fill rate badges (3 kolommen: Veld, Vulgraad, Voorbeelden).

## Geen andere bestanden
Alleen `bendy-sync/index.ts` en `BendySync.tsx`. Edge function wordt herdeployed.

## Technische details

### syncUsers matching logica
```text
Match 1: bendy_id (eerder gekoppeld)
Match 2: email case-insensitive (alleen als professional nog geen bendy_id heeft)
```

### User statistieken in diagnostics
```text
user_statistics: { total_synced, total_pending, total_cached }
user_field_fill_rates: FieldFillRate[] (hergebruikt analyzeFieldFillRates)
```

### Verificatie (12 checks)
1. buildFullName helper bestaat
2. syncUsers functie met SyncResult return type
3. syncUsers haalt /api/v2/users op
4. syncUsers matcht op bendy_id en email
5. syncUsers schrijft naar bendy_raw_cache met entity_type 'users'
6. syncUsers schrijft naar bendy_id_mapping met entity_type 'professional'
7. BendySyncRequest accepteert 'sync_users'
8. Actie routing stuurt sync_users door
9. Diagnostics bevat user_statistics en user_field_fill_rates
10. UI heeft "Professional Sync Starten" knop
11. UI toont user sync resultaten
12. UI toont user velden tabel met fill rate badges

