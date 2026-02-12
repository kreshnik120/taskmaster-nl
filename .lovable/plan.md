
# BUGFIX P0-B — 4 High-Priority Fixes

Vier chirurgische fixes in 2 bestanden.

---

## Fix 1: Certificeringen wissen bij lege functieniveaus
**Bestand**: `NieuweDienstModal.tsx`, regels 475-480

Bij het uitvinken van een functieniveau: als de resulterende array leeg is, ook `setCertificeringen([])` aanroepen zodat er geen orphaned certificeringen in de database terechtkomen.

## Fix 2: Pre-toewijzing verbergen in edit-modus
**Bestand**: `NieuweDienstModal.tsx`, regels 519-569

Het hele pre-toewijzing blok wrappen in `{!isEdit && ( ... )}`. De insert-logica voor toewijzingen draait alleen bij nieuwe diensten, dus de UI moet ook alleen dan zichtbaar zijn.

## Fix 3: Certificering filter in presets opslaan/laden
**Bestand**: `PlanningFilters.tsx`

- Regel 66: `certificering` toevoegen aan de destructuring
- Regel 69: `certificering` toevoegen aan het filters-object bij insert
- Regel 87-95: `certificering: preset.filters.certificering ?? "all"` toevoegen aan loadPreset

## Fix 4: Dependency array auto-detect diensttype
**Bestand**: `NieuweDienstModal.tsx`, regel 220

`titelManual` toevoegen aan de dependency array van het auto-detect useEffect: `[startTijd, eindTijd, titelManual]`

---

## Technisch overzicht

| Bestand | Regels | Wijziging |
|---------|--------|-----------|
| `NieuweDienstModal.tsx` | 475-480 | setCertificeringen([]) bij lege niveaus |
| `NieuweDienstModal.tsx` | 519-569 | Wrap in `{!isEdit && ...}` |
| `NieuweDienstModal.tsx` | 220 | Dependency array uitbreiden |
| `PlanningFilters.tsx` | 66, 69, 87-95 | certificering in presets |
