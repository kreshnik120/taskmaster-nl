

# Fix 5 Planning Module Bugs

## Overzicht

5 gerichte bugfixes in 4 bestanden. Geen nieuwe bestanden, geen database wijzigingen.

---

## Bug 1: dienst_type case mismatch (NieuweDienstModal.tsx)

Database verwacht lowercase (`dag`, `avond`, `nacht`, `weekend`), formulier stuurt title case.

**Wijzigingen:**
- Regel 39: `dienstTypes` array naar lowercase waarden
- Regel 73: Default state `"dag"` ipv `"Dag"`
- Regel 122: Edit populate ook lowercase default
- Regel 140: Reset ook lowercase default
- Regel 367-370: Button labels tonen title case via `t.charAt(0).toUpperCase() + t.slice(1)`

---

## Bug 2: created_by veld bestaat niet (NieuweDienstModal.tsx)

Database kolom heet `aangemaakt_door`, niet `created_by`.

**Wijziging:**
- Regel 189: `created_by: user.id` wordt `aangemaakt_door: user.id`

---

## Bug 3: org_id fallback naar user.id (NieuweDienstModal.tsx)

Als `userOrg` null is, valt `org_id` terug op `user.id` wat een FK violation geeft.

**Wijziging:**
- Regel 188: Verwijder fallback `?? user.id`
- Na regel 168: Early return met toast.error als `!userOrg?.org_id`

---

## Bug 4: Opdrachtgever filter matcht nooit (3 bestanden)

PlanningFilters stuurt `client_organizations.id` als waarde, maar DienstData bevat alleen `organization.org_id` (niet de PK). Ze matchen nooit.

**Wijzigingen:**
1. `src/hooks/useClientOrganizations.ts` — voeg `org_id` toe aan de select query
2. `src/components/planning/PlanningFilters.tsx` — gebruik `o.org_id || o.id` als SelectItem value
3. `src/hooks/useDienstenPlanning.ts` — wijzig locatie filter om te matchen op `organization.org_id` OF `sublocation.id`

---

## Bug 5: PlanningLegenda mist "Voltooid" status (PlanningLegenda.tsx)

**Wijziging:**
- Voeg `{ label: "Voltooid", color: "bg-blue-400" }` toe na "Bezet" en voor "Concept"

---

## Technisch Overzicht

| Bestand | Wijzigingen |
|---------|-------------|
| `src/components/planning/NieuweDienstModal.tsx` | Bug 1 + 2 + 3 |
| `src/hooks/useDienstenPlanning.ts` | Bug 4 (locatie filter) |
| `src/hooks/useClientOrganizations.ts` | Bug 4 (org_id select) |
| `src/components/planning/PlanningFilters.tsx` | Bug 4 (value naar org_id) |
| `src/components/planning/PlanningLegenda.tsx` | Bug 5 |

Totaal: 5 bestanden, minimale wijzigingen per bestand.
