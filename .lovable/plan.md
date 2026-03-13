

# BENDY-REQ-6: Stale cleanup + sublocations filter

## Wijzigingen

### 1. Sublocations filter (regel 68-72)
Voeg `.eq('is_active', true)` toe aan de sublocations query, vóór de `.not('bendy_id', 'is', null)`.

### 2. Stale diensten cleanup (na regel 430)
Nieuw blok na de toewijzingen batch insert: itereer over `dienstMap`, vergelijk met `seenBendyIds` (alle bendy IDs uit `allRecords`). Markeer diensten als 'geannuleerd' als:
- Niet meer in Bendy (niet in `seenBendyIds`)
- Datum >= gisteren (geen historische cleanup)
- Status niet al 'geannuleerd' of 'voltooid'

### 3. Metadata uitbreiden (regel 440-451)
Voeg `debug_stale_marked`, `debug_stale_skipped_old`, `debug_stale_skipped_status` toe aan de metadata.

Pre-fetch select (regel 60) bevat al `status` en `datum` — geen wijziging nodig.

Deploy edge function na implementatie.

