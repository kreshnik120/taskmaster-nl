

# BENDY-REQ-5B-DIAG-2: Diagnostic logging voor assigned requisitions

## Wijzigingen in `bendy-sync-requisitions.ts`

### 1. Assigned fetch met include parameter (regel 36)
Voeg `include: 'flex_user_company'` toe aan de assigned fetch zodat de API eventueel included data meestuurt.

### 2. Diagnostic logging toevoegen (na regel 43, voor de `if (allRecords.length === 0)` check)
Voeg een diagnostisch blok toe dat logt:
- Aantal en types in `assignedResult.included`
- Sample included item (type, id, relationship keys, attribute keys)
- Alle relationship keys + fuc_data van eerste assigned requisition
- Alle attribute keys van eerste assigned requisition
- Relationship keys van één cached user uit `bendy_raw_cache`

Sla diagnostische variabelen op in een `diagData` object.

### 3. Metadata uitbreiden (regels 408-419)
Voeg de diagnostische velden toe aan de metadata write:
- `debug_diag_included_count`
- `debug_diag_included_types`
- `debug_diag_assigned_rel_keys`
- `debug_diag_user_rel_keys`
- `debug_diag_fuc_data_sample`

### 4. Deploy edge function

Geen andere code wordt gewijzigd.

