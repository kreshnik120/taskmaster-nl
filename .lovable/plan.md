

# OpenClaw Proxy Edge Function

## Wat wordt gebouwd

Een nieuwe edge function `openclaw-proxy` die als veilige backend dient voor de OpenClaw AI-gateway op je VPS. De functie draait met `service_role` rechten (via `SUPABASE_SERVICE_ROLE_KEY` die automatisch beschikbaar is in edge functions) en wordt beveiligd met een API key in de `X-API-Key` header.

## Authenticatie

De functie valideert requests via de bestaande `CITOZORG_API_KEY` secret (al geconfigureerd). Je VPS stuurt deze mee als `X-API-Key` header. Geen JWT nodig.

## Actie 1: `lookup_sender`

Input: `{ "action": "lookup_sender", "telefoon": "+31648005001" }`

Zoeklogica (in volgorde):
1. **Hardcoded admins** — Controleert tegen een lijst van admin-nummers (`+31648005001`, `+31618710360`). Retourneert `{ role: "admin", naam: "Admin" }`.
2. **professionals** — Zoekt in `telefoonnummer` met `ilike '%<laatste 8 cijfers>%'`. Retourneert `{ role: "professional", id, full_name, functie_niveau, status }`.
3. **client_contacts** — Zoekt in `telefoon` met dezelfde ilike, JOIN naar `client_organizations` voor `org_id` en `org_name`. Retourneert `{ role: "client_contact", id, naam, functie, organization_id, organization_name }`.
4. **Niet gevonden** — `{ role: "unknown" }`.

## Actie 2: `query_db`

Input: `{ "action": "query_db", "query_type": "get_schedule", "professional_id": "...", "org_id": "...", "date_from": "2026-02-24", "date_to": "2026-03-03" }`

Ondersteunde query types:

| query_type | Beschrijving | JOINs |
|---|---|---|
| `get_schedule` | Rooster van een professional | `dienst_toewijzingen` -> `diensten` -> `client_sublocations` -> `client_locations` -> `client_organizations` |
| `get_availability` | Beschikbaarheid van een professional | `professional_availability` tabel |
| `get_documents` | Documenten van een professional | `professional_documents` tabel |

### get_schedule JOINs detail
```
dienst_toewijzingen (professional_id)
  -> diensten (dienst_id = diensten.id)
    -> client_sublocations (sublocation_id = client_sublocations.id)
      -> client_locations (location_id = client_locations.id)
        -> client_organizations (client_org_id = client_organizations.id)
```

Retourneert per dienst: datum, start/eind tijd, titel, locatie naam, organisatie naam, status.

## Beveiliging

- `verify_jwt = false` in config.toml (auth in code via API key)
- Validatie van `X-API-Key` header tegen `CITOZORG_API_KEY`
- Alleen specifieke, voorgedefinieerde queries — geen raw SQL
- Rate limiting is niet nodig (VPS-to-VPS communicatie)

## Na deployment

Je krijgt:
- **URL**: `https://oelmsmcgryeoryhonexw.supabase.co/functions/v1/openclaw-proxy`
- **Header**: `X-API-Key: <jouw CITOZORG_API_KEY waarde>`
- **Content-Type**: `application/json`
- **Method**: `POST`

## Technische details

### Bestanden
| Bestand | Actie |
|---|---|
| `supabase/functions/openclaw-proxy/index.ts` | Nieuw — volledige edge function |
| `supabase/config.toml` | Wordt automatisch bijgewerkt |

### Request voorbeelden

```json
// lookup_sender
POST /functions/v1/openclaw-proxy
X-API-Key: <CITOZORG_API_KEY>
{ "action": "lookup_sender", "telefoon": "+31648005001" }

// get_schedule
POST /functions/v1/openclaw-proxy
X-API-Key: <CITOZORG_API_KEY>
{
  "action": "query_db",
  "query_type": "get_schedule",
  "professional_id": "uuid-hier",
  "date_from": "2026-02-24",
  "date_to": "2026-03-03"
}
```
