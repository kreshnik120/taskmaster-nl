
# BENDY-FIX-1: Database Voorbereiding + KvK Diagnostiek

## Overzicht
Fixt twee root causes (verkeerde org_id + ontbrekende bendy_id kolom) via een database migratie, breidt de diagnostiek uit met per-KvK matching analyse, en toont dit in een nieuwe tabel op de Bendy Sync pagina.

## Wijziging 1 -- Database Migratie (nieuw bestand)

SQL migratie met 6 stappen:

1. **Fix org_id** -- UPDATE `bendy_sync_config` SET org_id naar CitoZorg UUID (`650e8400-e29b-41d4-a716-446655440001`) voor tenant `citozorg`
2. **bendy_id kolom** -- ALTER TABLE `client_sublocations` ADD COLUMN `bendy_id TEXT`
3. **Index** -- CREATE INDEX op `client_sublocations(bendy_id)` met WHERE NOT NULL
4. **Entity type constraint** -- DROP + ADD CHECK constraint op `bendy_id_mapping.entity_type` met `organization` en `sublocation` erbij
5. **Wis incorrecte mappings** -- DELETE FROM `bendy_id_mapping` WHERE tenant = 'citozorg'
6. **Wis oude cache** -- DELETE FROM `bendy_raw_cache` WHERE tenant = 'citozorg'

## Wijziging 2 -- `supabase/functions/bendy-sync/index.ts`

### handleStatusCheck() uitbreiden (na regel 455, voor return op regel 457)

Voegt per-KvK breakdown logica toe:
- Haalt alle records uit `bendy_raw_cache` voor citozorg/clients
- Groepeert per KvK-nummer (uit `raw_data.attributes.chamber_of_commerce_number`)
- Per KvK: zoekt matching `client_organizations` en telt bijbehorende sublocaties via `client_locations` -> `client_sublocations`
- Sorteert op bendy_count (aflopend)

Voegt `kvk_breakdown` array toe aan het `diagnostics` object in de response (regel 467-474).

## Wijziging 3 -- `src/pages/BendySync.tsx`

### 3a. Interfaces (regels 52-59)

Nieuw `KvkBreakdown` interface + `kvk_breakdown` veld toevoegen aan `Diagnostics`:

```text
interface KvkBreakdown {
  kvk_nummer: string;
  org_name: string | null;
  org_found: boolean;
  bendy_count: number;
  bendy_examples: string[];
  local_sublocations: number;
}
```

### 3b. Nieuwe "KvK Matching Overzicht" card (na regel 336, voor regel 338)

Tabel met kolommen:
- KvK-nummer (font-mono)
- Organisatie (abcito) -- "Niet gevonden" in rood als niet gematcht
- Bendy records (count)
- Lokale sublocaties (count)
- Status badge: rood "Org ontbreekt" / amber "Geen sublocaties" of "Bendy heeft meer" / groen "OK"

Onder de tabel: sectie met Bendy voorbeeldnamen per KvK (max 3 namen + "+X meer").

## Geen andere wijzigingen
- Routing en sidebar blijven identiek
- Sync logica (OAuth2, fetchBendyApi, syncClients) ongewijzigd
- Alleen handleStatusCheck() en BendySync.tsx UI uitgebreid
