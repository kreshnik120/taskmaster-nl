

# Uitbreiding openclaw-proxy Edge Function

## Overzicht

6 wijzigingen in één bestand: `supabase/functions/openclaw-proxy/index.ts`

---

## 1. Fix lookup_sender voor admins

**Probleem**: Admins krijgen alleen `{"role":"admin","naam":"Admin"}` zonder `id` of `org_ids`.

**Oplossing**: Vervang de hardcoded admin-check door een lookup-map die phone → profile_id + naam mapt, en haal org_ids op uit `user_organizations`.

```text
ADMIN_MAP = {
  "+31648005001" → { id: "7095191d-...", naam: "Kreshnik Atashi" },
  "+31618710360" → { id: "daeb8147-...", naam: "Lesley Pattipeilohy" }
}
```

- Query `user_organizations` voor de org_ids van dat profile id
- Fallback: als geen org_ids gevonden, hardcode beide bureau-IDs
- Response: `{ role: "admin", naam: "...", id: "uuid", org_ids: [...] }`

---

## 2. Nieuwe actie: `get_tasks`

Toegevoegd als top-level action (niet onder `query_db`).

- Query: `tasks` tabel
- Filters: `completed_at IS NULL`, `deleted_at IS NULL`
- Optioneel: `user_id` → filter `assignee_id`, `org_id` → filter `org_id`
- Admin zonder filters → alle open taken
- Select: `id, title, description, status, priority, due_at, start_at, assignee_id, reporter_id, category, next_action, project_id, column_id, created_at`
- Order: `due_at ASC NULLS LAST`
- Limit: 50

---

## 3. Nieuwe actie: `create_task`

- Verplicht: `title`, `org_id`
- Optioneel: `description`, `assignee_id`, `reporter_id`, `due_at`, `start_at`, `priority`, `category`, `status` (default `open`), `project_id`, `column_id`
- Insert + return aangemaakte taak (zelfde veilige kolommen)

---

## 4. Nieuwe actie: `update_task`

- Verplicht: `task_id`
- Optionele updates: `title`, `description`, `status`, `priority`, `due_at`, `start_at`, `assignee_id`, `completed_at`, `next_action`, `category`, `column_id`
- Update + return bijgewerkte taak

---

## 5. Nieuwe actie: `get_professionals`

- Query: `professionals` tabel
- Optioneel filter: `org_id`
- Filter: `deleted_at IS NULL`
- Veilige kolommen: `id, full_name, email, telefoonnummer, functie_niveau, status, org_id`
- Gevoelige velden (bsn, iban, iban_tenaamstelling, gewenst_uurloon, geboortedatum) worden NOOIT opgehaald

---

## 6. Nieuwe actie: `get_clients`

Er is geen `clients` tabel. Ik gebruik `client_organizations` + geneste `client_contacts`.

- Query: `client_organizations` met JOIN op `client_contacts`
- Optioneel filter: `org_id`
- Return per organisatie: `id, name, org_id, contacts: [{ naam, functie, telefoon, email }]`

---

## Routing-structuur

De huidige code heeft 2 top-level actions: `lookup_sender` en `query_db`. De nieuwe acties worden toegevoegd als extra top-level actions:

```text
action = "lookup_sender"    → bestaand (gefixt)
action = "query_db"         → bestaand (ongewijzigd)
action = "get_tasks"        → NIEUW
action = "create_task"      → NIEUW
action = "update_task"      → NIEUW
action = "get_professionals" → NIEUW
action = "get_clients"      → NIEUW
```

---

## Beveiliging

- Zelfde `X-API-Key` authenticatie
- Zelfde `service_role` client
- Expliciet whitelisten van kolommen (nooit `SELECT *`)
- Gevoelige velden worden nergens opgehaald

## Geen database-wijzigingen nodig

Alle tabellen bestaan al met de juiste kolommen.

