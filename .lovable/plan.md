

# STAP 1: Sublocations search toevoegen aan openclaw-proxy

## Huidige situatie
De `handleSearch` functie in `openclaw-proxy/index.ts` (regel 636-694) ondersteunt 4 entity_types: `professionals`, `clients`, `diensten`, `tasks`. Bij `entity_type=sublocations` wordt niets uitgevoerd en een leeg object `{}` geretourneerd.

## Belangrijk: tabel heet `client_sublocations`
Er is geen tabel `sublocations` — de juiste tabel is **`client_sublocations`** met deze relevante kolommen:
- `id` (uuid)
- `naam` (text) — niet `name`
- `adres` (text) — niet `address`
- `doelgroep_omschrijving` (text) — vergelijkbaar met zorgzwaarte
- `location_id` (uuid) — parent location
- `gekoppelde_bv_org_id` (uuid) — org koppeling

## Wijziging

**Bestand:** `supabase/functions/openclaw-proxy/index.ts`

Voeg na het `tasks`-blok (regel 689-690) een nieuw blok toe voor `sublocations`:

```typescript
if (!entityType || entityType === "sublocations") {
  promises.push(
    supabase
      .from("client_sublocations")
      .select("id, naam, adres, doelgroep_omschrijving, location_id, gekoppelde_bv_org_id")
      .or(`naam.ilike.${q},adres.ilike.${q},doelgroep_omschrijving.ilike.${q}`)
      .limit(50)
      .then(({ data }) => { results.sublocations = data || []; })
  );
}
```

Dit volgt exact het bestaande patroon van de andere entity_types, met:
- **ILIKE** op `naam`, `adres`, en `doelgroep_omschrijving` (case-insensitive)
- Limit op **50** (zoals gevraagd)
- Resultaat als `{ "sublocations": [...] }` (consistent met andere types)

## Geen andere wijzigingen
- Database schema: ongewijzigd
- Frontend: ongewijzigd
- Andere actions in openclaw-proxy: ongewijzigd

## Verificatie
Na deploy testen met de opgegeven curl command (met `entity_type: "sublocations"`).

