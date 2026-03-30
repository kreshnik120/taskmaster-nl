

# FIX: `get_diensten` filter op `dienst_id`

## Wat verandert
In `supabase/functions/openclaw-proxy/index.ts`, functie `handleGetDiensten` (regel 457-479): een optionele `dienst_id` filter toevoegen, identiek aan het patroon dat we eerder voor `professional_id` hebben toegepast.

## Wijziging (1 regel toevoegen)

Op regel 466, vóór de bestaande filters, voegen we toe:

```typescript
if (body.dienst_id) query = query.eq("id", body.dienst_id as string);
```

De functie wordt dan:

```typescript
async function handleGetDiensten(supabase, body) {
  const limit = Math.min(Number(body.limit) || 50, 100);

  let query = supabase
    .from("diensten")
    .select(DIENST_SAFE_COLUMNS)
    .order("datum", { ascending: true })
    .limit(limit);

  if (body.dienst_id) query = query.eq("id", body.dienst_id as string);  // NIEUW
  if (body.org_id) query = query.eq("org_id", body.org_id as string);
  if (body.status) query = query.eq("status", body.status as string);
  if (body.sublocation_id) query = query.eq("sublocation_id", body.sublocation_id as string);
  if (body.is_spoed) query = query.eq("is_spoed", true);
  if (body.datum_van) query = query.gte("datum", body.datum_van as string);
  if (body.datum_tot) query = query.lte("datum", body.datum_tot as string);

  const { data, error } = await query;
  // ... rest blijft gelijk
}
```

## Verificatie
Na deploy: POST naar openclaw-proxy met `{ "action": "get_diensten", "dienst_id": "<UUID>" }` → verwacht exact 1 record.

## Niet aanraken
- Geen andere handlers, geen database wijzigingen, geen frontend

