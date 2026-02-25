

# Update openclaw-proxy: `get_profile` query type toevoegen

## Wijziging

Eenvoudige uitbreiding van de bestaande Edge Function met een vierde query type.

**Bestand:** `supabase/functions/openclaw-proxy/index.ts`

### 1. Switch case uitbreiden (regel 141-150)
Voeg `get_profile` toe aan de switch:
```typescript
case "get_profile":
  return await getProfile(supabase, professionalId);
```

### 2. Nieuwe functie `getProfile` toevoegen (na `getDocuments`)

```typescript
async function getProfile(supabase, professionalId) {
  // Validatie
  if (!professionalId) return 400 error

  // Query — ALLEEN veilige kolommen, NOOIT bsn/iban/geboortedatum/uurloon
  select("id, full_name, functie_niveau, status, telefoonnummer, email")
  .eq("id", professionalId)
  .maybeSingle()

  // Niet gevonden → 404
  // Gevonden → { profile: { ... } }
}
```

### Beveiliging
Expliciet alleen deze 6 kolommen in de `.select()`:
- `id`, `full_name`, `functie_niveau`, `status`, `telefoonnummer`, `email`

**Uitgesloten** (nooit opgehaald): `bsn`, `iban`, `iban_tenaamstelling`, `gewenst_uurloon`, `geboortedatum`

### Request voorbeeld
```json
POST /functions/v1/openclaw-proxy
X-API-Key: <OPENCLAW_API_KEY>
{
  "action": "query_db",
  "query_type": "get_profile",
  "professional_id": "uuid-hier"
}
```

### Response voorbeelden
```json
// Succes
{ "profile": { "id": "...", "full_name": "...", "functie_niveau": "...", "status": "...", "telefoonnummer": "...", "email": "..." } }

// Niet gevonden
{ "error": "Professional niet gevonden" }  // 404
```

Direct deployen na wijziging.

