
# 7 Display Fixes voor Planning Kaarten en Lijstweergave

Zeven chirurgische fixes in 3 bestanden om ontbrekende data-weergaven te herstellen.

---

## Fix 1: Functieniveau array weergave in lijstmodus
**Bestand**: `PlanningLijstWeergave.tsx`, regels 71-74

Huidige code toont het array-object direct. Wijzig naar `.join(", ")` met fallback, plus `truncate` class.

## Fix 2: Slaapdienst indicator in DienstCard compact
**Bestand**: `DienstCard.tsx`, regel 70 (na de bestaande bezet-info div)

Voeg een slaapdienst emoji indicator toe wanneer `dienst.is_slaapdienst` waar is, binnen het compact info-blok (regels 63-70).

## Fix 3: Certificeringen in DienstCard full mode
**Bestand**: `DienstCard.tsx`, regels 105-108

Na de functieniveau span in full mode, voeg een conditionele certificeringen-weergave toe met haakjes-notatie.

## Fix 4: Herhaling-kinderen krijgen herhaling "geen"
**Bestand**: `NieuweDienstModal.tsx`, regels 346-351

Voeg `herhaling: "geen"` toe aan het herhalingRecords push-object zodat child-diensten geen verwarrende herhalingswaarde hebben.

## Fix 5: Dienst type in lijstweergave
**Bestand**: `PlanningLijstWeergave.tsx`, regel 62

Voeg `d.dienst_type` toe achter de uren-weergave.

## Fix 6: Werkvorm badge in DienstCard compact
**Bestand**: `DienstCard.tsx`, regels 68-69

Voeg `dienst.werkvorm` toe tussen functieniveau en bezetting, met separator.

## Fix 7: Nachtdienst indicator in lijstweergave
**Bestand**: `PlanningLijstWeergave.tsx`, regel 59

Voeg nachtdienst- en slaapdienst-emoji's toe achter de datum.

---

## Technisch overzicht

| Bestand | Regels | Wijziging |
|---------|--------|-----------|
| `PlanningLijstWeergave.tsx` | 71-74 | `.join(", ")` voor functieniveau array |
| `PlanningLijstWeergave.tsx` | 62 | Dienst type toevoegen |
| `PlanningLijstWeergave.tsx` | 59 | Nacht/slaap emoji's |
| `DienstCard.tsx` | 63-70 | Slaapdienst emoji in compact |
| `DienstCard.tsx` | 68-69 | Werkvorm toevoegen in compact |
| `DienstCard.tsx` | 105-108 | Certificeringen in full mode |
| `NieuweDienstModal.tsx` | 346-351 | `herhaling: "geen"` in child records |
