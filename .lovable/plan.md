

# BENDY-REQ-5B-FIX-4: FUC matching via user sync cache

## Wijzigingen

### 1. User sync include uitbreiden (`bendy-sync-users.ts`, regel 30)

```
WAS:  { include: 'groups,company' }
WORDT: { include: 'groups,company,flex_user_companies' }
```

### 2. Requisition sync — verwijder individuele FUC fetches, vervang door cache fallback (`bendy-sync-requisitions.ts`, regels 269-347)

Verwijder het hele blok met individuele `/api/v2/flex_user_companies/{id}` fetches (regels 280-324) en de bestaande cache fallback (326-345).

Vervang door:
- Eén cache-based lookup die `bendy_raw_cache` users ophaalt
- Per user de `relationships.flex_user_companies.data` array uitleest
- Per fuc entry `fucMap.set(fucId, userBendyId)` doet
- Debug metadata: `debug_fuc_map_source`, `debug_cache_users_checked`, `debug_cache_users_with_fuc`

### 3. Metadata opschonen (regels 444-465)

Verwijder spreaded `debugFucData` (bevatte oude velden). Voeg nieuwe debug velden direct toe.

### Niet aanraken
- Overlap trigger, cleanup, frontend, database schema, andere syncs

