

# 7 Fixes Professionals Pagina

## Fix A: Hard delete naar Soft delete (KRITIEK)
**Bestand:** `src/components/ProfessionalDetailModal.tsx` (regel 320-323)

Vervang `.delete()` door `.update({ deleted_at: new Date().toISOString() })` in de `handleDelete` functie.

---

## Fix B: Document badge logica (KRITIEK) — 4 stappen

### B1: SQL migratie
Nieuwe kolom toevoegen aan `professionals` tabel:
```sql
ALTER TABLE public.professionals
ADD COLUMN IF NOT EXISTS documents_published_count INTEGER DEFAULT 0;
```

### B2: Sync berekening (`supabase/functions/bendy-sync/index.ts`)
- **Regel 1521**: `published` toevoegen aan de select query (was: `document_name, document_type, expires_at`)
- **Regels 1533-1537**: `documents_published_count` toevoegen aan metaData object, berekend als telling van docs waar `published === true`

### B3: Badge logica (`src/components/recruitment/ProfessionalCard.tsx`)
- `documents_published_count` toevoegen aan Professional interface
- Badge logica uitbreiden met 4 staten:
  1. Verlopen docs (rood) -- hoogste prioriteit
  2. Gepubliceerde docs > 0 (groen, met aantal)
  3. Docs aanwezig maar geen gepubliceerd (oranje outline)
  4. Geen docs (grijs)

### B4: Filter (`src/pages/Professionals.tsx`)
- `documents_published_count` toevoegen aan interface (na regel 105)
- Filter "ok" wijzigen: checkt nu op `documents_published_count > 0` in plaats van `documents_count > 0`

---

## Fix C: Edit mode mist 4 velden (HOOG)
**Bestand:** `src/components/ProfessionalDetailModal.tsx`

- **editData state** (regel 237-252): `woonplaats`, `postcode`, `adres`, `geboortedatum` toevoegen
- **handleEdit** (regel 257-272): velden vullen vanuit professional object
- **handleSave** (regel 283-298): velden meesturen in `.update()` call
- **Persoonsgegevens UI** (regels 584-601): Adres, Postcode, Woonplaats, Geboortedatum bewerkbaar maken met Input componenten in edit mode. Postcode en Woonplaats worden 2 aparte velden.

---

## Fix D: Gepubliceerd kolom in documenten tabel (HOOG)
**Bestand:** `src/components/ProfessionalDetailModal.tsx` (regels 1131-1183)

- Grid template wijzigen: `grid-cols-[1fr_140px_100px_90px]` naar `grid-cols-[1fr_140px_100px_70px_70px]`
- 5e kolomheader "Gepubl." toevoegen
- Per document-rij een "Ja" (groen) of "Nee" (oranje) badge tonen op basis van `doc.published`

---

## Fix E: Beschikbaarheidsnotities verplaatsen (HOOG)
**Bestand:** `src/components/ProfessionalDetailModal.tsx`

- **Verwijderen** uit Ervaring tab (regels 1425-1440, inclusief Separator erboven)
- **Toevoegen** aan Beschikbaarheid tab (regels 1491-1493), na de BeschikbaarheidMiniKalender component

---

## Fix F: Document type kolom slim maken (HOOG)
**Bestand:** `src/components/ProfessionalDetailModal.tsx` (regels 1158-1159)

Conditie toevoegen: toon `document_type` alleen als het verschilt van `document_name`, anders "---"

---

## Fix G: "Nieuw (7d)" KPI filter werkend maken
**Bestand:** `src/pages/Professionals.tsx`

- `matchesNieuw` filter toevoegen in de `filteredProfessionals` chain (na regel 302): alleen professionals tonen waarvan `created_at` maximaal 7 dagen geleden is, maar alleen wanneer `activeKpi === "nieuw"`
- Toevoegen aan de return conditie

---

## Samenvatting bestanden

| Fix | Bestand | Actie |
|-----|---------|-------|
| A | ProfessionalDetailModal.tsx | soft delete |
| B1 | SQL migratie | kolom toevoegen |
| B2 | bendy-sync/index.ts | select + metaData |
| B3 | ProfessionalCard.tsx | interface + badges |
| B4 | Professionals.tsx | interface + filter |
| C | ProfessionalDetailModal.tsx | state/edit/save/UI |
| D | ProfessionalDetailModal.tsx | 5e kolom docs |
| E | ProfessionalDetailModal.tsx | blok verplaatsen |
| F | ProfessionalDetailModal.tsx | conditie type |
| G | Professionals.tsx | nieuw filter |

Na deployment: Document Sync draaien via BendySync pagina om `documents_published_count` te berekenen.
