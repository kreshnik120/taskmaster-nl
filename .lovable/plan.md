

# Uitbreiding openclaw-proxy: 14 nieuwe acties

## Kritisch: Kolomnamen corrigeren

De user-opgegeven kolomnamen wijken op **veel plekken** af van de echte database. Ik corrigeer ze allemaal:

| User-opgave | Echte DB-kolom | Tabel |
|---|---|---|
| `opmerking` | `publieke_opmerking` | diensten |
| `type` | `dienst_type` | diensten |
| `aantal_professionals` | `gevraagd_aantal` | diensten |
| `hours_per_week` | `weekly_hours` | assignments |
| `org_id` | *(bestaat niet)* | assignments |
| `function_title` | *(bestaat niet)* | assignments |
| `factuurnummer` | `factuur_nummer` | factuur |
| `totaal_bedrag` | `totaal` | factuur |
| `btw_bedrag` | `btw_bedrag` ✓ | factuur |
| `periode_van/tot` | *(bestaan niet)* | factuur |
| `score` | `completeness_score` | professional_applications |
| `source` | `source_label` | professional_applications |
| `notes` | *(bestaat niet)* | professional_applications |
| `title` | `titel` | vacancies |
| `description` | `beschrijving` | vacancies |
| `function_level` | `functie_niveau` | vacancies |
| `hours_per_week` | `uren_per_week` | vacancies |
| `start_date` | `start_datum` | vacancies |
| `org_id` | *(bestaat niet)* | vacancies |
| `client_sublocations.name` | `naam` | client_sublocations |
| `client_organizations.status` | *(bestaat niet)* | client_organizations |

## Wijzigingen — 1 bestand

**Bestand:** `supabase/functions/openclaw-proxy/index.ts`

### Stap 1: Constanten + `stripPII` toevoegen (na regel 20, vóór `extractLast8`)

Voeg toe:
- Gecorrigeerde `DIENST_SAFE_COLUMNS` (met echte kolomnamen)
- `DIENST_TOEWIJZING_SAFE_COLUMNS`
- Gecorrigeerde `ASSIGNMENT_SAFE_COLUMNS` (zonder niet-bestaande kolommen)
- Gecorrigeerde `FACTUUR_SAFE_COLUMNS` (echte kolomnamen, zonder `periode_van/tot`)
- Gecorrigeerde `APPLICATION_SAFE_COLUMNS` (echte kolomnamen)
- Gecorrigeerde `VACANCY_SAFE_COLUMNS` (echte kolomnamen)
- `PII_PATTERNS` regex array
- `stripPII()` functie

### Stap 2: Switch cases toevoegen (14 nieuwe cases)

Voeg 14 nieuwe cases toe aan de bestaande switch (vóór `default`):
```text
get_diensten, get_dienst_toewijzingen, get_assignments, get_facturen,
get_applications, get_vacancies, get_dashboard_stats, search,
create_dienst, update_dienst, assign_professional, update_assignment,
update_factuur_status, update_application_stage
```

### Stap 3: 14 handler functies toevoegen

Elk met gecorrigeerde kolomnamen:

**READ (8):**
1. `get_diensten` — kolom `publieke_opmerking` ipv `opmerking`, `dienst_type` ipv `type`, `gevraagd_aantal` ipv `aantal_professionals`
2. `get_dienst_toewijzingen` — join `professionals(id, full_name, email, functie_niveau)`
3. `get_assignments` — `weekly_hours` ipv `hours_per_week`, join `client_sublocations(id, naam, ...)`, zonder `org_id`/`function_title`
4. `get_facturen` — `factuur_nummer` ipv `factuurnummer`, `totaal` ipv `totaal_bedrag`, zonder `periode_van/tot`, join via `opdrachtgever_id`
5. `get_applications` — `completeness_score` ipv `score`, `source_label` ipv `source`, zonder `notes`
6. `get_vacancies` — `titel`, `beschrijving`, `functie_niveau`, `uren_per_week`, `start_datum`, join `client_sublocations(id, naam)`, zonder `org_id`
7. `get_dashboard_stats` — parallel counts; vacancies count ipv `org_id` filter (niet beschikbaar)
8. `search` — `client_organizations` zonder `.status` filter

**WRITE (6):**
9. `create_dienst` — gecorrigeerde veldnamen
10. `update_dienst` — gecorrigeerde veldnamen
11. `assign_professional` — ongewijzigd (dienst_toewijzingen kolommen kloppen)
12. `update_assignment` — `weekly_hours` ipv `hours_per_week`, zonder `function_title`
13. `update_factuur_status` — ongewijzigd (alleen `status` + `updated_at`)
14. `update_application_stage` — ongewijzigd (alleen `pipeline_stage` + `updated_at`)

### Bestaande code

Alle 7 bestaande acties blijven **exact** ongewijzigd.

### Deploy

Automatische deploy na wijziging.

