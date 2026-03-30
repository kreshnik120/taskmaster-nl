

# FIX-NACHTUREN-1: Netto uren formule fix + mismatch correctie

## Probleem
1. **netto_uren GENERATED ALWAYS formule** is kapot voor nachtdiensten (eind_tijd < start_tijd). PostgreSQL `TIME + INTERVAL '24 hours'` wraps terug naar dezelfde waarde. **20 actieve diensten** hebben negatieve uren.
2. **1 status mismatch**: bendy_id 17070296 is ten onrechte geannuleerd door stale cleanup.

## Taak 1: Fix netto_uren formule (database migratie)

Drop en re-create de `netto_uren` kolom met de correcte formule:

```sql
ALTER TABLE public.diensten DROP COLUMN IF EXISTS netto_uren;

ALTER TABLE public.diensten
  ADD COLUMN netto_uren NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE
      WHEN eind_tijd > start_tijd THEN
        EXTRACT(EPOCH FROM (eind_tijd - start_tijd)) / 3600.0 
        - COALESCE(pauze_minuten, 0) / 60.0
      WHEN eind_tijd < start_tijd THEN
        (EXTRACT(EPOCH FROM (eind_tijd - start_tijd)) + 86400) / 3600.0 
        - COALESCE(pauze_minuten, 0) / 60.0
      ELSE 0
    END
  ) STORED;
```

Dit fixt automatisch alle 31 negatieve uren records — geen UPDATE nodig.

## Taak 2: Status mismatch correctie (data update)

```sql
UPDATE diensten SET status = 'open' WHERE bendy_id = '17070296';
```

## Taak 3: Verificatie

- Controleer `SELECT COUNT(*) FROM diensten WHERE netto_uren < 0` → verwacht: **0**
- Hercheck week 23-29 maart uren totaal (zal stijgen omdat negatieve uren nu positief zijn)
- Bevestig dienst 17070296 status = 'open'

## Niet aanraken
- Sync code, bendy_raw_cache, frontend
- De andere 2 "mismatches" (17500302 en 17144130) — die zijn correct

## Verwacht resultaat
- 0 diensten met negatieve uren
- Nauwkeurigere urentotalen in de planning
- 17070296 terug als open dienst

