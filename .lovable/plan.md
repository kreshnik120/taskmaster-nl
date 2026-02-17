
# UX-FIX-2 -- Professionals Pagina Verbeterslag #2

## Overzicht
Zes verbeteringen: status dot bug fix, paginering (24 per pagina), sortering dropdown, uitgebreide zoek, altijd-zichtbare resultaten teller, en verbeterde timestamps op kaarten.

---

## Onderdeel 1: Status Dot Bug Fix
**Bestand:** `src/components/recruitment/ProfessionalCard.tsx` (r64-77)

Voeg ontbrekende cases toe aan `getStatusColor()`:
- `'inactief'` -> `'bg-red-400'`
- `'pauze'` / `'op_pauze'` -> `'bg-orange-400'`

---

## Onderdeel 2: Paginering
**Bestand:** `src/pages/Professionals.tsx`

- Import `ChevronLeft`, `ChevronRight` uit lucide-react (r9)
- Constante `PAGE_SIZE = 24` na imports
- State `currentPage` met `useState(1)` (na r123)
- `useEffect` om `currentPage` te resetten bij filter/zoek wijziging
- `totalPages` en `paginatedProfessionals` berekeningen na `filteredProfessionals`
- Grid gebruikt `paginatedProfessionals.map` i.p.v. `filteredProfessionals.map` (r724)
- Paginering UI met Vorige/Volgende knoppen en pagina-nummers (na het grid, voor empty state)

---

## Onderdeel 3: Sortering Dropdown
**Bestand:** `src/pages/Professionals.tsx`

- State `sortOption` met default `"naam_az"`
- `sortProfessionals()` helper met 5 opties (naam A-Z, naam Z-A, nieuwste, oudste, status)
- `filteredProfessionals` gewrapped met `sortProfessionals()`
- Sort dropdown in filter bar (na zoekbalk, voor Filters knop)
- `hasActiveFilters` en `resetFilters` bijgewerkt voor `sortOption`

---

## Onderdeel 4: Zoek Uitbreiden
**Bestand:** `src/pages/Professionals.tsx`

- Zoeklogica uitbreiden: full_name, email, telefoonnummer, regio (r268)
- Placeholder aanpassen naar "Zoek op naam, email, telefoon of regio..." (r622)

---

## Onderdeel 5: Resultaten Teller Altijd Tonen
**Bestand:** `src/pages/Professionals.tsx` (r715-720)

- Altijd tonen, niet alleen bij actieve filters
- Bij geen filters: "X professionals"
- Bij actieve filters: "X van Y professionals"

---

## Onderdeel 6: Timestamp Verbeteren
**Bestand:** `src/components/recruitment/ProfessionalCard.tsx`

- Interface uitbreiden met `documents_synced_at?: string | null`
- `timeInStatus` vervangen door `timeLabel`:
  - Als `documents_synced_at` bestaat: "Docs gesyncet X geleden"
  - Anders: "Geregistreerd X geleden"
- `addSuffix: true` voor natuurlijke taal

---

## Bestanden die wijzigen

1. `src/pages/Professionals.tsx` -- paginering, sortering, zoek, teller
2. `src/components/recruitment/ProfessionalCard.tsx` -- status dot fix, timestamp, interface

## Technische details

```text
Nieuwe imports:
- Professionals.tsx r9: + ChevronLeft, ChevronRight
- ProfessionalCard.tsx: geen nieuwe imports

Nieuwe state variabelen (Professionals.tsx):
- currentPage: number (default 1)
- sortOption: string (default "naam_az")

PAGE_SIZE = 24

sortProfessionals wraps filteredProfessionals
paginatedProfessionals = filteredProfessionals.slice(...)
Grid gebruikt paginatedProfessionals.map

ProfessionalCard interface uitbreiding:
  documents_synced_at?: string | null;

hasActiveFilters checkt ook sortOption !== "naam_az"
resetFilters reset ook sortOption naar "naam_az" en currentPage naar 1
```
