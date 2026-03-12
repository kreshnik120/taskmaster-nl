

# Fix: Cleanup functie timeout door lichtere SQL

## Probleem
De huidige `cleanup_diensten_duplicates` functie gebruikt `ROW_NUMBER() OVER (PARTITION BY ...)` op 71.500 rijen — die window function scan alleen al kost meer tijd dan de edge function timeout toestaat.

## Oplossing

### 1. Database migratie — vervang functie met lichtere SQL
Nieuwe `CREATE OR REPLACE FUNCTION cleanup_diensten_duplicates` die:
- **Geen `ROW_NUMBER()`** meer gebruikt
- Gebruikt `EXISTS (SELECT 1 FROM diensten d2 WHERE d2.org_id = d1.org_id AND d2.bendy_id = d1.bendy_id AND d2.created_at < d1.created_at)` — dit is snel (bewezen: ~70k resultaten in <1s)
- Delete slechts 500 per batch (kleiner = sneller)
- Telt resterende duplicaten met dezelfde EXISTS query
- Maakt UNIQUE index aan als 0 remaining

### 2. Edge function — batch_size verlagen
Regel 2497: `batch_size: 2000` → `batch_size: 500`

### 3. Frontend — geen wijzigingen nodig
De while-loop en voortgangs-UI zijn al correct.

