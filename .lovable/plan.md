
# Optimistic Locking voor Diensten

## Overzicht
Voorkom dat twee gebruikers tegelijkertijd dezelfde dienst overschrijven door een `lock_version` kolom toe te voegen met automatische verhoging bij elke update.

## Stap 1: Database Migratie

```sql
ALTER TABLE diensten ADD COLUMN lock_version INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_lock_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.lock_version := OLD.lock_version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_diensten_lock_version
  BEFORE UPDATE ON diensten
  FOR EACH ROW
  EXECUTE FUNCTION increment_lock_version();
```

Bestaande diensten krijgen automatisch `lock_version = 0`.

## Stap 2: DienstData Interface

**Bestand: `src/hooks/useDienstenPlanning.ts`**

Voeg `lock_version: number` toe aan de `DienstData` interface (na `kleur`). Het veld wordt automatisch opgehaald door de `select("*")` query.

## Stap 3: Edit Save met Lock Check

**Bestand: `src/components/planning/NieuweDienstModal.tsx`** (regel 416-418)

Huidige code:
```typescript
const { error } = await supabase.from("diensten").update(dienstData).eq("id", editDienst!.id);
if (error) throw error;
```

Nieuwe code:
```typescript
const { data: updated, error } = await supabase
  .from("diensten")
  .update(dienstData)
  .eq("id", editDienst!.id)
  .eq("lock_version", editDienst!.lock_version)
  .select("id")
  .single();

if (error?.code === "PGRST116" || !updated) {
  toast.error("Deze dienst is ondertussen door iemand anders gewijzigd. Sluit het formulier en probeer opnieuw.", { duration: 6000 });
  queryClient.invalidateQueries({ queryKey: ["diensten-planning"] });
  setSaving(false);
  return;
}
if (error) throw error;
```

PostgREST code `PGRST116` = "geen rij gevonden" (0 rows matched), wat betekent dat de `lock_version` niet meer klopt.

## Stap 4: Sluiten Dienst met Lock Check

**Bestand: `src/components/planning/DienstDetailSheet.tsx`** (regel 45-46)

Dezelfde patroon toepassen op `handleSluitenDienst`:
```typescript
const { data: updated, error } = await supabase
  .from("diensten")
  .update({ status: "geannuleerd" })
  .eq("id", dienst.id)
  .eq("lock_version", dienst.lock_version)
  .select("id")
  .single();

if (error?.code === "PGRST116" || !updated) {
  toast.error("Dienst is ondertussen gewijzigd. Vernieuw de pagina.");
  return;
}
```

## Stap 5: Kopieer Operatie -- Geen Wijziging Nodig

De `handleCopyDienst` in `Planning.tsx` doet een INSERT (regel 93) en stuurt geen `lock_version` mee. Dit is correct en hoeft niet aangepast.

## Gewijzigde Bestanden
1. Database migratie (nieuw)
2. `src/hooks/useDienstenPlanning.ts` -- interface uitbreiding
3. `src/components/planning/NieuweDienstModal.tsx` -- edit save lock check
4. `src/components/planning/DienstDetailSheet.tsx` -- sluiten lock check
