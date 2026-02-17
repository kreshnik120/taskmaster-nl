
# STATUS-FIX — Professional Status Mapping Fix

## Overzicht
Drie wijzigingen om de onjuiste status-mapping van Bendy-gesyncte professionals te corrigeren. Bendy's "inactief" state betekent "niet op opdracht" en moet in abcito.io als "actief" worden behandeld.

---

## Onderdeel 1: SQL Migratie — Bestaande Data Corrigeren

Nieuwe database migratie die alle Bendy-gesyncte professionals met status 'inactief' corrigeert naar 'actief':

```sql
UPDATE public.professionals
SET status = 'actief', updated_at = now()
WHERE deleted_at IS NULL
  AND bendy_id IS NOT NULL
  AND status = 'inactief';
```

---

## Onderdeel 2: Insert Path Fix (r930-932)

In `supabase/functions/bendy-sync/index.ts`, de `isActive` logica aanpassen zodat alleen 'geblokkeerd', 'verwijderd', 'blocked', 'deleted' als inactief worden beschouwd:

```typescript
// Huidige code (r930-932):
const isActive = attrs.state
  ? attrs.state.toLowerCase() !== 'inactief'
  : true;

// Nieuwe code:
const isActive = attrs.state
  ? !['geblokkeerd', 'verwijderd', 'blocked', 'deleted'].includes(attrs.state.toLowerCase())
  : true;
```

De bestaande `status: isActive ? 'actief' : 'inactief'` op r941 blijft ongewijzigd.

---

## Onderdeel 3: Update Path Fix (na r864)

In `supabase/functions/bendy-sync/index.ts`, na de `bendy_created_at` update (r864) en voor de `functie_niveau` update (r866), status-update logica toevoegen:

```typescript
// Status updaten op basis van Bendy state
const bendyState = attrs.state?.toLowerCase();
if (bendyState && ['geblokkeerd', 'verwijderd', 'blocked', 'deleted'].includes(bendyState)) {
  updateData.status = 'inactief';
} else if (matchedPro.status === 'inactief' && matchedPro.bendy_id) {
  updateData.status = 'actief';
}
```

---

## Bestanden die wijzigen

1. **Nieuwe SQL migratie** -- corrigeert bestaande data
2. **supabase/functions/bendy-sync/index.ts** -- twee locaties: insert path (r930-932) en update path (na r864)

## Technische details

```text
Insert path (r930-932):
  isActive check verandert van !== 'inactief' naar !includes(['geblokkeerd','verwijderd','blocked','deleted'])
  r941 (status: isActive ? 'actief' : 'inactief') blijft ongewijzigd

Update path (na r864, voor r866):
  Nieuwe status-update logica met bendyState variabele
  Herstelt status naar 'actief' voor Bendy-professionals die niet geblokkeerd zijn

Geen andere bestanden worden gewijzigd.
```
