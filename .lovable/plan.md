
# STATUS-CORRECTIE — Bendy is LEIDEND

## Probleem
De vorige STATUS-FIX was FOUT. Bendy data is de bron van waarheid. Als iemand in Bendy "inactief" staat, moet die OOK "inactief" zijn in abcito.io. De vorige fix verwijderde "inactief" uit de blocked list en zette alle inactieve professionals naar actief.

---

## Onderdeel 1: SQL Migratie — Data Herstellen vanuit bendy_raw_cache

Nieuwe migratie die de correcte status herstelt op basis van de originele Bendy state uit de raw cache:

```sql
UPDATE public.professionals p
SET
  status = CASE
    WHEN LOWER(COALESCE(brc.raw_data -> 'attributes' ->> 'state', '')) IN ('inactief', 'geblokkeerd', 'verwijderd', 'blocked', 'deleted')
      THEN 'inactief'
    ELSE 'actief'
  END,
  updated_at = now()
FROM public.bendy_raw_cache brc
WHERE brc.bendy_id = p.bendy_id
  AND brc.entity_type = 'users'
  AND p.deleted_at IS NULL
  AND p.bendy_id IS NOT NULL;
```

---

## Onderdeel 2: Insert Path Fix (r938-941)

Huidige code (FOUT — mist 'inactief'):
```typescript
        // Status uit state
        // Bendy 'inactief' betekent "niet op opdracht" — ...
        // Alleen 'geblokkeerd' of 'verwijderd' uit Bendy maakt ze inactief
        const isActive = attrs.state
          ? !['geblokkeerd', 'verwijderd', 'blocked', 'deleted'].includes(attrs.state.toLowerCase())
          : true;
```

Nieuwe code ('inactief' TOEGEVOEGD):
```typescript
        // Status uit Bendy state — Bendy is leidend
        const isActive = attrs.state
          ? !['inactief', 'geblokkeerd', 'verwijderd', 'blocked', 'deleted'].includes(attrs.state.toLowerCase())
          : true;
```

r952 (`status: isActive ? 'actief' : 'inactief'`) blijft ongewijzigd.

---

## Onderdeel 3: Update Path Fix (r866-873)

Huidige code (FOUT — herstelt onterecht naar actief):
```typescript
        // Status updaten op basis van Bendy state
        const bendyState = attrs.state?.toLowerCase();
        if (bendyState && ['geblokkeerd', 'verwijderd', 'blocked', 'deleted'].includes(bendyState)) {
          updateData.status = 'inactief';
        } else if (matchedPro.status === 'inactief' && matchedPro.bendy_id) {
          // Herstel naar actief als Bendy ze niet als geblokkeerd markeert
          updateData.status = 'actief';
        }
```

Nieuwe code (Bendy is LEIDEND):
```typescript
        // Status updaten op basis van Bendy state — Bendy is leidend
        const bendyState = attrs.state?.toLowerCase();
        if (bendyState && ['inactief', 'geblokkeerd', 'verwijderd', 'blocked', 'deleted'].includes(bendyState)) {
          updateData.status = 'inactief';
        } else if (bendyState) {
          updateData.status = 'actief';
        }
```

---

## Bestanden die wijzigen

1. **Nieuwe SQL migratie** -- herstelt correcte status vanuit bendy_raw_cache
2. **supabase/functions/bendy-sync/index.ts** -- twee locaties: insert path (r938-941) en update path (r866-873)

## Technische details

```text
Insert path (r938-941):
  'inactief' TOEGEVOEGD aan de includes array
  Comment aangepast naar "Bendy is leidend"
  r952 (status: isActive ? 'actief' : 'inactief') ONGEWIJZIGD

Update path (r866-873):
  'inactief' TOEGEVOEGD aan de includes array
  else-if checkt nu alleen bendyState (niet meer matchedPro.status === 'inactief')
  Geen "herstel naar actief" logica meer die handmatige keuzes overschrijft

SQL migratie:
  JOIN op bendy_raw_cache via bendy_id + entity_type = 'users'
  CASE op raw_data -> 'attributes' ->> 'state'
  Herstelt correcte status voor ALLE Bendy-gesyncte professionals
```
