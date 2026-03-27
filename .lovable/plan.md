

# DATA-FIX-5: Spookdiensten annuleren + ontbrekende toewijzingen identificeren

## Stappen

### 1. Annuleer 54 "API-open" spookdiensten
UPDATE `diensten` via insert tool: zet status naar `geannuleerd` voor diensten die in `bendy_raw_cache` als `open` staan, momenteel foutief `volledig_bezet` zijn, en geen toewijzing hebben. JOIN met `bendy_raw_cache` op `bendy_id`. Verwacht: 54 rijen.

### 2. Verificatie telling
Read-only query via psql: tel open/ingepland/geannuleerd + uren voor week 23-29 maart. Verwacht: open=1, ingepland≈172, geannuleerd=54+.

### 3. Toon 21 "closed" diensten zonder toewijzing
Read-only query via psql: lijst van diensten met `closed` status in Bendy maar zonder `dienst_toewijzingen` rij. Inclusief medewerker-naam uit `raw_data->attributes->flex_user_company->flex_user_name`.

## Technisch
- Stap 1: insert tool (UPDATE statement)
- Stap 2-3: psql read queries
- Geen schema-wijzigingen, geen code changes

