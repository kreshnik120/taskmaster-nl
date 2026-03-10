

# BENDY-REQ-3: Flex Company → Professional Matching Test — Sectie H

## Wat

Sectie H toevoegen binnen het bestaande "Bendy Requisitions Verkenning" Card, na Sectie G (regel 1658), vóór de `</CardContent>` op regel 1661.

## Wijzigingen — `src/pages/BendySync.tsx`

### 1. State (bij regel 152)
Twee nieuwe states: `companyMatchLoading` en `companyMatchResult`.

### 2. Functie `fetchCompanyMatchTest` (na `fetchAssignedUserTest`)
Exact zoals opgegeven: haalt assigned requisitions op voor flex_user_company IDs, laadt user cache, bouwt company→users map, matcht, en berekent samenvatting (exact/geen/meerdere).

### 3. UI — Sectie H (invoegen na regel 1658, vóór `</CardContent>`)
Binnen het bestaande Card, na Sectie G, conditioneel op `reqAnalysisResult`:

- `<Separator />` scheidingslijn
- Sub-titel "Flex Company → Professional Matching" + beschrijving
- "Matching Testen" button (outline, spinner)
- Samenvatting: 4 badges (unieke bedrijven, exact match, meerdere, geen match)
- Stats rij met assigned reqs, users in cache, bedrijven in cache
- Resultaten tabel: Company ID, Match badge (groen/oranje/rood), Professional(s) naam+email, Type, Diensten count
- Gesorteerd op requisitionCount

Geen bestaande code wordt gewijzigd — alleen toevoegingen.

