
# Duplicaat-checks toevoegen aan diagnostiek endpoint

## Wijziging
**Bestand:** `supabase/functions/bendy-sync/index.ts`

### 1. Duplicaat-check queries toevoegen (na regel 1564, voor de return op r1566)
- Query alle professionals met `bendy_id` en groepeer op duplicaten
- Query alle professionals met `email` en groepeer op duplicaten (case-insensitive)
- Tel totaal professionals, met/zonder `bendy_id`

### 2. `data_quality` object toevoegen aan diagnostics response (na `user_field_fill_rates` op r1592)
Bevat:
- `total_professionals`, `with_bendy_id`, `without_bendy_id`
- `duplicate_bendy_ids` array (bendy_id + count + betrokken professionals)
- `duplicate_emails` array (email + count + betrokken professionals)
- `has_duplicates` boolean

## Geen andere wijzigingen
- Sync functies ongewijzigd
- Frontend ongewijzigd
- Geen migraties
