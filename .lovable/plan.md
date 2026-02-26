

# Uitbreiding openclaw-proxy: 4 acties

## Bestand: `supabase/functions/openclaw-proxy/index.ts`

### 1. Nieuwe actie: `get_professional` (zoek op naam)

- ilike match op `full_name`
- Optioneel filter: `org_id`
- Select: `id, full_name, telefoonnummer, email, functie_niveau, werkvorm, status, org_id, regio, skills, beschikbaarheidsnotities, certificaten`
- Gevoelige velden (bsn, iban, iban_tenaamstelling, gewenst_uurloon, etc.) worden NOOIT geselecteerd
- Output door `stripPII()`
- Limit 10

### 2. Nieuwe actie: `search_professionals`

- `org_id` verplicht
- Optionele filters: `status`, `functie_niveau`, `werkvorm`
- Zelfde veilige kolommen als `get_professional`
- Sorteer op `full_name ASC`, limit 50
- Output door `stripPII()`

### 3. Nieuwe actie: `get_team_members`

- Query `profiles` tabel: `id, name, email`
- JOIN met `user_organizations` via `user_id` om `role` en `org_id` op te halen
- Filter op `org_id` als meegegeven
- Twee-staps query: eerst user_ids uit `user_organizations`, dan profiles ophalen

### 4. `update_task` — al bestaand, geen wijziging nodig

De huidige `update_task` handler (regel 335-367) ondersteunt al exact de gevraagde velden: `task_id`, `status`, `priority`, `due_at`, `next_action`, `completed_at`, `assignee_id`, `description`, `title`. Geen wijziging nodig.

### Switch cases toevoegen

3 nieuwe cases vóór `default`:
```
case "get_professional": → handleGetProfessional
case "search_professionals": → handleSearchProfessionals  
case "get_team_members": → handleGetTeamMembers
```

### Bestaande code

Alle bestaande acties blijven ongewijzigd.

### Deploy

Automatische deploy na wijziging.

