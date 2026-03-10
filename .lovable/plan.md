

# BENDY-REQ-4: Client ID → Sublocation Matching — Sectie I

## Wat

Sectie I toevoegen binnen het bestaande "Bendy Requisitions Verkenning" Card, na Sectie H (regel 1819), vóór `</CardContent>` op regel 1821.

## Wijzigingen — `src/pages/BendySync.tsx`

### 1. State (bij regel 154)
Twee nieuwe states: `clientMatchLoading` en `clientMatchResult`.

### 2. Functie `fetchClientMatchTest` (na `fetchCompanyMatchTest`)
Exact zoals opgegeven: haalt open + assigned requisitions op, verzamelt client IDs, queryt `client_sublocations` (met joins naar organizations) en `bendy_id_mapping` voor pending status, matcht, en berekent samenvatting + requisition dekking.

### 3. UI — Sectie I (invoegen na regel 1819, vóór `</CardContent>`)
Binnen het bestaande Card, conditioneel op `reqAnalysisResult`:

- `<Separator />` scheidingslijn
- Sub-titel "Client ID → Sublocation Matching" + beschrijving
- "Client Matching Testen" button (outline, spinner)
- Samenvatting: 3 badges (gematcht/pending/niet gematcht) + requisition dekking badge met kleurcodering
- Stats rij: open reqs, assigned reqs, sublocations met bendy_id
- Resultaten tabel: Client ID, Status badge, Requisition naam, Sublocation info, Open, Assigned, Totaal
- Niet-gematchte rijen krijgen `bg-red-50` achtergrond
- Gesorteerd op totaal (hoogste eerst)

Geen bestaande code wordt gewijzigd — alleen toevoegingen.

