

# DIAG-6: Identificeer extra diensten — API vs Bendy UI

## Actie
Vier read-only SQL queries uitvoeren via `psql` om de 56-diensten gap te analyseren. Geen codewijzigingen.

**Belangrijk**: De queries uit het verzoek gebruiken `LEFT JOIN sublocations s`, maar de tabel heet `client_sublocations`. Dit wordt gecorrigeerd in de uitvoering.

### Queries

1. **Open diensten per dag** — Dagelijkse telling van `status = 'open'` diensten. Vergelijk met Bendy UI (totaal 5).

2. **Open diensten detail** — Alle 55 open diensten met locatie, tijden, `bendy_api_status` uit raw cache, en check op `flex_user` in de relationships (niet attributes). Dit onthult of "open" diensten in de API eigenlijk al toegewezen zijn in Bendy.

3. **Resterende ingeplande duplicaten** — Groepen met `COUNT > 1` op sublocation+datum+start+eind bij bezette diensten. Verwacht: nog ~6 groepen na de eerdere migratie.

4. **Ingepland per dag** — Dagelijkse telling bezette diensten + uren. Vergelijk met Bendy UI (totaal 150).

### Correctie op flex_user check
De Bendy API slaat `flex_user_company` op als een relationship, niet als attribute. De query wordt aangepast naar:
```sql
rc.raw_data->'relationships'->'flex_user_company'->'data'->>'id' IS NOT NULL
```

## Niet aanraken
Geen code, geen schema, geen migraties.

