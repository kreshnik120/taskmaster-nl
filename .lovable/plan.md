

# BENDY-REQ-2: Assigned User Koppeling Test — Sectie G

## Wat

Sectie G toevoegen binnen het bestaande "Bendy Requisitions Verkenning" Card, na Sectie F (Ruwe JSON, regel 1461), maar vóór de `</>` op regel 1462.

## Wijzigingen — `src/pages/BendySync.tsx`

### 1. State (bij regel 149)
Twee nieuwe states: `userTestLoading` en `userTestResult`.

### 2. Functie `fetchAssignedUserTest` (na `fetchRequisitionSample`)
Exact zoals opgegeven: 3 API calls via bendy-proxy met `include=user`, `include=flex_user`, en `include=client,user,flex_user`. Analyseert included types, relationship keys, en flex_user_company IDs. Resultaten opgeslagen in `userTestResult`.

### 3. Separator import
`Separator` component toevoegen aan imports.

### 4. UI — Sectie G (invoegen na regel 1461, vóór `</>`)
Binnen het bestaande Card, na Sectie F:

- `<Separator />` scheidingslijn
- Sub-titel "Assigned User Koppeling Test" + beschrijving
- "User Koppeling Testen" button (outline variant, spinner)
- Per test (3 stuks): titel, status badge (groen/rood/grijs), included types als badges, user relationship waarde, alle relationship keys
- Samenvatting: alle unieke relationship keys + flex_user_company IDs
- Per test met rawFirstRecord: Collapsible `<pre>` JSON

Geen bestaande code wordt gewijzigd.

