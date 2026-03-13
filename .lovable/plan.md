

# BENDY-REQ-5B-FIX-5: Company ID matching

## Wijzigingen in `bendy-sync-requisitions.ts`

### 1. FucMap building (regels 308-344) — Vervang flex_user_companies lookup door company match

Het huidige blok zoekt naar `relationships.flex_user_companies.data` (array) in cached users. Dit bestaat niet.

**Nieuw**: Zoek naar `relationships.company.data.id` per user. Dit is het company ID dat matcht met `flex_user_company.data.id` op assigned requisitions.

```typescript
const metadata_fuc: any = { debug_fuc_map_source: 'none', debug_cache_users_checked: 0, debug_cache_users_with_company: 0, debug_duplicate_companies: 0 };

// Build fucMap: company ID → user bendy_id
if (fucIds.size > 0) {
  const { data: cachedUsers } = await adminClient
    .from('bendy_raw_cache')
    .select('bendy_id, raw_data')
    .eq('org_id', orgId)
    .eq('entity_type', 'users')
    .limit(50000);

  let cacheChecked = 0, cacheWithCompany = 0, duplicateCompanies = 0;
  for (const cu of (cachedUsers || [])) {
    cacheChecked++;
    const companyId = (cu.raw_data as any)?.relationships?.company?.data?.id;
    if (companyId) {
      cacheWithCompany++;
      if (fucMap.has(String(companyId))) duplicateCompanies++;
      fucMap.set(String(companyId), String(cu.bendy_id));
    }
  }
  metadata_fuc.debug_fuc_map_source = fucMap.size > 0 ? 'company_match' : 'none';
  metadata_fuc.debug_cache_users_checked = cacheChecked;
  metadata_fuc.debug_cache_users_with_company = cacheWithCompany;
  metadata_fuc.debug_duplicate_companies = duplicateCompanies;
}
```

### 2. Diagnostic logging (regels 45-83) — Verwijder logProgress en queries, behoud diagData in metadata

Verwijder de `logInfo` calls, de sample user query, en de `logProgress('1B-DIAG')` call. Behoud de diagData variabelen zodat ze nog 1x in metadata verschijnen.

### 3. Metadata (regels 448-459) — Opschonen

Vervang `...metadata_fuc` spread (die nu de nieuwe velden bevat). Verwijder `debug_cache_users_with_fuc`. Behoud `...diagData` nog 1 sync.

### 4. Deploy

