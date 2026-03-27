

# FIX-EARLYSTOP-1: Delta sync earlyStop logica fixen

## Root Cause Analyse

De `fetchDeltaBendyRecords` functie (bendy-helpers.ts:195-253) heeft drie problemen:

1. **API negeert `sort=-updated_at`**: De Bendy API sorteert niet op `updated_at`, waardoor oude en nieuwe records door elkaar staan op elke pagina. `newOnPage` wordt nooit 0 → earlyStop triggert nooit.

2. **Ontbrekende `updated_at` telt als nieuw** (regel 230): `if (!updatedAt || ...)` — records zonder `updated_at` worden als "nieuw" geteld, wat earlyStop verder ondermijnt.

3. **PAGE_SIZE=100, MAX_PAGES=50** → max 5.000 records, maar de API heeft 24.400+ open en 36.900+ assigned. Zelfs als earlyStop werkt, haalt hij nog steeds te veel op.

## Gekozen oplossing: Cache-vergelijking i.p.v. API-sorting

Omdat de API niet sorteert, kan earlyStop niet werken op basis van `updated_at` alleen. In plaats daarvan:

**Nieuwe strategie**: Haal pagina's op en vergelijk elk record met de `bendy_raw_cache`. Stop zodra een volledige pagina alleen records bevat die al ongewijzigd in de cache staan (zelfde `updated_at`).

Dit werkt onafhankelijk van de API-sortering.

## Wijzigingen

### 1. `supabase/functions/_shared/bendy-helpers.ts` — `fetchDeltaBendyRecords` herschrijven

**WAS** (regel 195-253): Vergelijkt `updated_at` met `cutoffDate`, afhankelijk van API-sortering.

**WORDT**:
- Accepteer een `adminClient` parameter
- Per pagina: haal de `bendy_id`'s op, query de `bendy_raw_cache` voor hun `updated_at` waarden
- Tel hoeveel records op de pagina een andere `updated_at` hebben dan de cache (= gewijzigd)
- Als 0 gewijzigd op een pagina → earlyStop
- Records die wél gewijzigd zijn worden toegevoegd aan `allRecords`
- Behoud fallback: als er geen cache is (eerste sync), haal alles op

```text
fetchDeltaBendyRecords(tenant, endpoint, cutoffDate, adminClient, extraParams?)
  ↓
  Per pagina (100 records):
    1. Fetch van API
    2. Verzamel bendy_id's van deze pagina
    3. Query bendy_raw_cache voor deze id's + hun updated_at
    4. Vergelijk: record.attributes.updated_at !== cache.updated_at → "gewijzigd"
    5. Voeg alleen gewijzigde records toe aan resultaat
    6. Als 0 gewijzigd → earlyStop = true, break
  ↓
  Return alleen gewijzigde records
```

### 2. Callers updaten

**`bendy-sync-requisitions.ts`** (regel 53-55) en **`bendy-sync-users.ts`** (regel 43): Geef `adminClient` door aan `fetchDeltaBendyRecords`.

### 3. PAGE_SIZE verhogen voor delta

Verhoog `PAGE_SIZE` naar 500 voor delta fetches (of gebruik een aparte `DELTA_PAGE_SIZE`). Met cache-vergelijking en earlyStop is dit veilig — de sync stopt na 1-2 pagina's als er weinig wijzigingen zijn.

## Verwacht resultaat

- Incrementele sync na 10 min idle: haalt 1-2 pagina's op (500-1000 records), vergelijkt met cache, vindt 0-5 wijzigingen, earlyStop na pagina 2
- CPU-gebruik: <5 seconden i.p.v. timeout
- Logs tonen: `Delta early stop na pagina 2: 0 gewijzigde records`

## Niet aanraken
- Full sync logica
- Cache schema
- Diensten-verwerkingslogica

