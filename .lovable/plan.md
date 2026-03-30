

# FIX: `get_professionals` filter op `professional_id`

## Wat verandert
In `supabase/functions/openclaw-proxy/index.ts`, functie `handleGetProfessionals` (regel 408-426): een optionele `professional_id` filter toevoegen.

## Wijziging

```typescript
async function handleGetProfessionals(supabase, body) {
  const orgId = body.org_id as string | undefined;
  const professionalId = body.professional_id as string | undefined;  // NIEUW

  let query = supabase
    .from("professionals")
    .select("id, full_name, email, telefoonnummer, functie_niveau, status, org_id")
    .is("deleted_at", null);

  if (professionalId) query = query.eq("id", professionalId);  // NIEUW
  if (orgId) query = query.eq("org_id", orgId);

  const { data, error } = await query.order("full_name", { ascending: true });
  // ... rest blijft gelijk
}
```

## Verificatie
Na deploy: POST naar openclaw-proxy met `{ "action": "get_professionals", "professional_id": "<UUID>" }` en bevestig dat exact 1 record terugkomt.

## Niet aanraken
- Geen andere handlers, geen database wijzigingen, geen frontend

