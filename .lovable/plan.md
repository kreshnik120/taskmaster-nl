

# BENDY-REQ-5B-FIX-1: Fix toewijzing matching — flex_user_companies apart ophalen

## Wijzigingen

### 1. Edge function (`supabase/functions/bendy-sync/index.ts`)

**A. Remove useless include on assigned fetch (regel 1661)**
```
fetchAllBendyRecords(tenant, '/api/v2/requisitions/assigned')
```

**B. Replace STAP 5A fucMap logic (regels 1947-1981) with new approach:**

1. Collect unique flex_user_company IDs from allRecords
2. Fetch `/api/v2/flex_user_companies` with `include: 'user'` via `fetchAllBendyRecords`
3. Build fucMap from the fetched records' `relationships.user.data.id` or `relationships.flex_user.data.id`
4. Fallback: if fucMap still empty, try company matching via `bendy_raw_cache` users (company→user map)
5. Log with checkpoint `2B-FUC-MAP` including `fucIdsFromReqs`, `fucMapSize`, `method`

**C. Add no-match diagnostic sampling (in 5D loop, regels 2024-2034)**
- Track first 3 no-match cases with details (fucId, userBendyId, prof found?) and log them

**D. Expand metadata update (regels 2066-2081)**
- Add debug fields: `debug_fuc_ids_from_reqs`, `debug_fuc_map_size`, `debug_prof_map_size`, `debug_existing_tw`, `debug_method`

### Niet aanraken
- Overlap trigger, cleanup, frontend, database schema, other syncs

