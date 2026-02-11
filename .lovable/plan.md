

# 7 Bugfixes Planning Module

## Fix 1: `created_by` naar `aangemaakt_door` in Planning.tsx handleCopy (regel 107)

**Bestand:** `src/pages/Planning.tsx`
**Regel 107:** `created_by: user.id` wordt `aangemaakt_door: user.id`

---

## Fix 2: Kopie status altijd "concept"

**Bestand:** `src/pages/Planning.tsx`
**Regel 103:** Huidige logica behoudt originele status (behalve geannuleerd). Wijzig naar:
```
status: "concept",
```
Dit voorkomt dat een kopie met status `volledig_bezet` verschijnt zonder toewijzingen.

---

## Fix 3: Stale data in DienstDetailSheet

**Bestand:** `src/components/planning/DienstDetailSheet.tsx`
**Probleem:** `dienst` prop is een snapshot die niet mee-update na mutaties (bevestigen, sluiten).
**Fix:** Na `handleBevestigen` (regel 62) en `handleSluitenDienst` (regel 51): voeg `onClose()` toe zodat de sheet sluit na mutatie. `handleBevestigen` mist dit -- voeg `onClose()` toe na invalidate.

---

## Fix 4: Preset filter op ingelogde user_id

**Bestand:** `src/components/planning/PlanningFilters.tsx`
**Regel 49-56:** Query haalt ALLE presets op zonder user_id filter.
**Fix:** Haal user op en filter:
```typescript
const { data: presets = [] } = useQuery({
  queryKey: ["dienst-filter-presets"],
  queryFn: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from("dienst_filter_presets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});
```

---

## Fix 5: Eindtijd > starttijd validatie

**Bestand:** `src/components/planning/NieuweDienstModal.tsx`
**Locatie:** In `handleSave` na de bestaande verplichte velden check (rond regel 154).
**Fix:** Voeg check toe:
```typescript
if (startTijd >= eindTijd) {
  toast.error("Eindtijd moet na starttijd liggen");
  return;
}
```

---

## Fix 6: netto_uren toevoegen aan dienstData

**Bestand:** `src/components/planning/NieuweDienstModal.tsx`
**Regel 175-195:** Voeg `netto_uren: duur` toe aan het `dienstData` object. De `duur` variabele bestaat al (regel 146). Zonder dit blijven KPI's en detail sheet op 0.

---

## Fix 7: parseISO voor tijdzone-veilige datum parsing

Vervang `new Date(dienst.datum)` door `parseISO(dienst.datum)` in 4 bestanden:

| Bestand | Regels | Aantal |
|---------|--------|--------|
| `src/hooks/useDienstenPlanning.ts` | 105, 210 | 2 |
| `src/components/planning/PlanningWeekKalender.tsx` | isSameDay call | 1 |
| `src/components/planning/PlanningLijstWeergave.tsx` | format call regel 59 | 1 |
| `src/components/planning/DienstDetailSheet.tsx` | format calls regel 120, 136 | 2 |

Elke wijziging: import `parseISO` uit `date-fns` en vervang `new Date(string)` door `parseISO(string)`.

---

## Technisch Overzicht

| Bestand | Fixes |
|---------|-------|
| `src/pages/Planning.tsx` | Fix 1 + 2 |
| `src/components/planning/DienstDetailSheet.tsx` | Fix 3 + 7 |
| `src/components/planning/PlanningFilters.tsx` | Fix 4 |
| `src/components/planning/NieuweDienstModal.tsx` | Fix 5 + 6 |
| `src/hooks/useDienstenPlanning.ts` | Fix 7 |
| `src/components/planning/PlanningWeekKalender.tsx` | Fix 7 |
| `src/components/planning/PlanningLijstWeergave.tsx` | Fix 7 |

Totaal: 7 bestanden, minimale gerichte wijzigingen.

