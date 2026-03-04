

# S41-B2: Documenten UI — Compleet Plan (met Categorie Groepering)

## Overzicht
Eén bestand wijzigt: `src/components/ProfessionalDetailModal.tsx`. De huidige code heeft al een **basis categorie groepering** (regels 1110-1137 met emoji headers), maar deze moet worden uitgebreid met:
1. Gekleurde badges per categorie (blue/purple/amber/gray)
2. **Opvouwbare** secties (Collapsible) per categorie
3. Bestand-acties (Ophalen/Bekijk/Download)
4. Bulk ophalen knop
5. 5e KPI "Bestanden"

## Wijzigingen

### 1. Professional interface uitbreiden (regel 67)
Toevoegen na `bendy_external_id`:
- `bendy_id: string | null` — nodig voor Bendy document fetch URL

### 2. State variabelen toevoegen (na regel 186)
- `fetchingDocId: string | null`
- `bulkFetching: boolean`
- `bulkProgress: { done: number; total: number; failed: number }`

### 3. Helpers + handlers toevoegen (na documentStats useMemo)
- `fileStats` memo — `{ withFile: number, total: number }`
- `docsWithoutFile` memo — docs met `bendy_document_id` maar zonder `file_path`
- `detectContentType(bytes)` — magic bytes detectie (PDF/JPG/PNG/DOCX)
- `handleFetchFromBendy(doc)` — bendy-proxy → base64 decode → storage upload → DB update → refresh local state
- `handleBulkFetch()` — sequentieel alle `docsWithoutFile` ophalen met voortgang

### 4. KPI grid uitbreiden (regels 1084-1101)
- Grid van `grid-cols-4` → `grid-cols-5`
- 5e KPI: "Bestanden" — `{withFile}/{total}`, `HardDrive` icoon, groen als compleet

### 5. Bulk ophalen knop (na sync info, regel 1108)
- Alleen zichtbaar als `docsWithoutFile.length > 0`
- Toont voortgang: "Ophalen: 3/12..."
- Toast na afloop met resultaat

### 6. Categorie groepering UPGRADEN (regels 1110-1276)
Huidige code heeft al groepering met emoji headers maar **niet opvouwbaar** en zonder kleur-badges.

Vervangen door:
- **Opvouwbare secties** via `Collapsible` per categorie (standaard open)
- **Categorie headers** met gekleurde badges:

| category | Label | Badge variant |
|----------|-------|---------------|
| basis | Basisdocumenten | `info` (blue) |
| zzp | ZZP Documenten | purple (custom class) |
| certificaat | Certificaten | `warning` (amber) |
| overig | Overige Documenten | `secondary` (gray) |

- Header bevat: emoji + label + gekleurde badge met aantal + chevron
- Binnen elke groep: bestaande document-rijen + uitbreiding

### 7. Document-rijen uitbreiden (binnen elke groep)
Per document-rij toevoegen:
- **Badges** naast naam: groene "Bestand" als `file_path` bestaat, blauwe "Handmatig" als `is_manual`
- **Actie-knoppen** vóór de chevron:
  - **Scenario A** (file_path): Eye (bekijk signed URL) + Download knoppen
  - **Scenario B** (bendy_document_id, geen file_path): "Ophalen" knop met spinner
  - **Scenario C** (is_manual, geen file_path): disabled Upload placeholder (S41-B3)

### 8. Detail panel uitbreiden (regels 1225-1268)
- Toon `file_name` en `content_type` als beschikbaar

### Niet aanraken
- Bestaande 4 KPI's (alleen grid uitbreiden)
- Detail panel structuur (alleen velden toevoegen)
- Sync info metadata
- bendy-proxy / bendy-sync edge functions

