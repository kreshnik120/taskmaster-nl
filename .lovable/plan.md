

# BENDY-M1-LOOKUP-BUREAU-FIX

## Wijzigingen in `supabase/functions/openclaw-proxy/index.ts`

### Fix 1 — Professional lookup (regels 211-226)
- Voeg `org_id` toe aan de `.select()` query
- Voeg `org_id: prof.org_id` toe aan de response

### Fix 2 — Client contact lookup (regels 228-245)
- Voeg `org_id` toe aan de `client_organizations` join: `client_organizations(id, name, org_id)`
- Cast aanpassen naar `{ id: string; name: string; org_id: string }`
- Voeg `org_id: org?.org_id ?? null` toe aan de response

Geen andere wijzigingen. Admin lookup blijft ongewijzigd.

