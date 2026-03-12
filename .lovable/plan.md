

# BENDY-REQ-CLEANUP: Duplicate diensten fix + preventie

## Wat wordt opgelost
~900 duplicate diensten verwijderen en permanent voorkomen via 3 samenhangende fixes.

## Implementatie

### 1. Database migratie
SQL migratie die:
- Duplicaten verwijdert (behoudt oudste per `org_id` + `bendy_id`, cascade ruimt `dienst_toewijzingen` op)
- UNIQUE index aanmaakt op `(org_id, bendy_id)` — NULLs worden niet geblokkeerd

### 2. Edge function fixes (`supabase/functions/bendy-sync/index.ts`)

**A. `.limit(5000)` toevoegen** aan beide pre-fetch queries (regels 1677-1681 en 1686-1689) zodat alle bestaande diensten gevonden worden.

**B. `batchInsert` → chunked `upsert`** (regels 1872-1883): Vervangt `batchInsert` door een `upsert` loop in chunks van 200, met `onConflict: 'org_id,bendy_id'`. Mapping local_ids worden bijgewerkt vanuit de upsert response.

### Niet aangeraakt
- Frontend, andere sync functies, logProgress debug code, helper functies, andere tabellen.

