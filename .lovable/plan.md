

# Diagnose + Fix: Requisition Sync maakt steeds 4850 diensten aan

## Root cause gevonden — geen diagnostiek nodig

Uit de edge function logs is het probleem al duidelijk. **Elke** diensten upsert chunk faalt met:

> `there is no unique or exclusion constraint matching the ON CONFLICT specification`

Dit komt doordat de UNIQUE index een **partial index** is (`WHERE bendy_id IS NOT NULL`). PostgREST/Supabase JS `upsert()` herkent partial indexes niet als conflict target. Daarom doet elke upsert een **INSERT** in plaats van een echte upsert, en worden er 4850 duplicaten aangemaakt per sync-run.

**Tweede probleem**: de pre-fetch van bestaande diensten gebruikt `.limit(5000)`. Bij de eerste sync matcht de `dienstMap` sommige records, maar na meerdere runs kunnen er meer dan 5000 records zijn waardoor de map incompleet is.

**Huidige stand**: er zijn nu slechts 848 diensten in de tabel (de cleanup heeft goed gewerkt), waarvan 846 met `bendy_id`.

## Plan van aanpak

### 1. Database migratie — echte UNIQUE constraint
- Drop de partial unique index `idx_diensten_org_bendy_id_unique`
- Maak een echte `UNIQUE` constraint op `(org_id, bendy_id)` (niet partial) aan via `ALTER TABLE ... ADD CONSTRAINT`
- PostgREST herkent constraints wél als conflict target
- `bendy_id` mag NULL zijn — Postgres staat meerdere NULLs toe bij unique constraints

### 2. Edge function — pre-fetch limiet verhogen + diagnostiek
- `.limit(5000)` verhogen naar `.limit(50000)` voor existingDiensten
- Diagnostische logging toevoegen zoals gevraagd (`3B-NULL-CHECK` en `3C-SAMPLE`) zodat we bij toekomstige issues snel de root cause zien
- Herdeployen

### 3. Niet aanraken
- Cleanup functie, frontend, andere syncs

### Verificatie
1. Deploy
2. Draai Requisition Sync
3. Verwacht: `created=4850` (eerste keer), daarna bij opnieuw draaien: `created=0, updated=0, skipped=~43100`
4. Check sync log voor `3B-NULL-CHECK` en `3C-SAMPLE` entries

