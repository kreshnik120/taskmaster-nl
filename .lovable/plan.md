
# UX Verbeterslag Professionals Module

## Overzicht
Zes gerichte verbeteringen aan de Professionals module: tab-herschikking, veldduplicatie opruimen, document compliance op kaarten en KPI's, performance fix met useMemo, loading/error handling, en een document compliance filter.

---

## 1. Tab-volgorde herschikken
**Bestand:** `src/components/ProfessionalDetailModal.tsx` (regels 535-551)

Huidige volgorde: Profiel, Ervaring, Historiek, Plaatsing, Beschikbaarheid, Documenten

Nieuwe volgorde: **Profiel, Documenten, Beschikbaarheid, Ervaring, Plaatsing, Historiek**

Alleen de TabsTrigger elementen herschikken; TabsContent blokken blijven op hun plek (Tabs matcht op `value`).

---

## 2. Veldduplicatie opruimen
**Bestand:** `src/components/ProfessionalDetailModal.tsx`

**A. Geboortedatum uit header verwijderen** (regels 473-478)
De geboortedatum met Cake icoon staat al in Persoonsgegevens (r577-582). Verwijder het uit de header.

**B. KvK en BTW uit Financieel sectie verwijderen** (regels 921-949)
KvK en BTW staan al in "Bedrijfsgegevens (Bendy)" (r973-1001). Verwijder beide velden uit de Financieel collapsible. De sectie behoudt alleen: gewenst uurloon + CAO akkoord.

---

## 3. Document compliance op Professional kaarten en KPI's
**Bestanden:** `src/pages/Professionals.tsx` + `src/components/recruitment/ProfessionalCard.tsx`

### 3a. 5e KPI card "Doc. verlopen"
- Import `FileWarning` uit lucide-react
- Grid van `grid-cols-2 md:grid-cols-4` naar `grid-cols-2 md:grid-cols-5`
- Nieuwe KPICard met rood thema (variant="rose" of custom)
- Berekening: `professionals.filter(p => p.documents_expiring_count && p.documents_expiring_count > 0).length`
- Klik-actie: stel document filter in op "verlopen"

### 3b. Document status badge op ProfessionalCard
- Voeg `documents_count` en `documents_expiring_count` toe aan ProfessionalCard's Professional interface
- Na de skills badges, voeg document compliance badge toe:
  - `documents_expiring_count > 0`: rode badge met waarschuwing
  - `documents_count > 0 && documents_expiring_count === 0`: groene badge "Docs OK"
  - `documents_count === 0 || null`: grijze badge "Geen docs"

---

## 4. Performance fix: useMemo voor documentStats
**Bestand:** `src/components/ProfessionalDetailModal.tsx`

Vervang de IIFE in de documenten TabsContent (regels 1033-1046) door een `useMemo` hook boven de return statement. Importeer `useMemo` (voeg toe aan de bestaande React import op regel 15). Gebruik `documentStats.expired`, `.expiringSoon`, `.valid`, `.now`, `.ninetyDays` in de template.

---

## 5. Loading state + error handling voor documents fetch
**Bestand:** `src/components/ProfessionalDetailModal.tsx`

- Nieuwe state: `const [documentsLoading, setDocumentsLoading] = useState(false)`
- Wrap de bestaande useEffect (regels 184-195) in try/catch met `setDocumentsLoading(true/false)` en `console.error` bij fout
- In de documenten tab: toon skeleton/spinner wanneer `documentsLoading` true is, in plaats van KPI's en tabel

---

## 6. Document compliance filter
**Bestand:** `src/pages/Professionals.tsx`

- Nieuwe state: `const [filterDocuments, setFilterDocuments] = useState<string>("all")`
- Nieuwe Select dropdown in het filter panel (na de regio input) met opties:
  - "Alle documenten"
  - "Verlopen docs"
  - "Docs OK"
  - "Geen docs"
- Filter logica toevoegen aan `filteredProfessionals`:
  - "verlopen": `p.documents_expiring_count && p.documents_expiring_count > 0`
  - "ok": `p.documents_count && p.documents_count > 0 && (!p.documents_expiring_count || p.documents_expiring_count === 0)`
  - "geen": `!p.documents_count || p.documents_count === 0`
- `hasActiveFilters` en `resetFilters` bijwerken om `filterDocuments` mee te nemen
- KPI "Doc. verlopen" klik-actie stelt `filterDocuments` in op "verlopen"

---

## Bestanden die wijzigen

1. `src/components/ProfessionalDetailModal.tsx` -- tab-volgorde, veldduplicatie, useMemo, loading state
2. `src/pages/Professionals.tsx` -- 5e KPI, document filter, filter logica
3. `src/components/recruitment/ProfessionalCard.tsx` -- interface + document badge

## Technische details

```text
Imports toe te voegen:
- ProfessionalDetailModal.tsx: useMemo (aan bestaande React import)
- Professionals.tsx: FileWarning uit lucide-react
- ProfessionalCard.tsx: geen nieuwe imports nodig (Badge is al geimporteerd)

ProfessionalCard interface uitbreiding:
  documents_count?: number | null;
  documents_expiring_count?: number | null;

KPI grid layout: grid-cols-2 md:grid-cols-5

Filter state flow:
  filterDocuments state -> filteredProfessionals filter -> hasActiveFilters check -> resetFilters
```
