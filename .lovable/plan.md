

# Fix V3: Niveaunummers, Diploma Validatie en Sociaal Werker Fix

## Probleem
1. "Mbo Sociaal werker 4" (26 professionals) wordt foutief gemapt naar "Begeleider" (nv3) in plaats van "Persoonlijk begeleider" (nv4)
2. MBO niveaunummers uit diploma-namen worden niet geparsed
3. De UI toont geen niveaunummers (bijv. "nv4")

## Wijzigingen

### A. Edge Function: Sociaal werker 4 fix (regel 461)
De regel die `sociaal.*werker` matcht naar "Begeleider" (rank 2) wordt opgesplitst. Een nieuwe regel voor `sociaal.*werker\s*4` met rank 4 wordt **erboven** geplaatst, zodat MBO-4 sociaal werkers correct als "Persoonlijk begeleider" worden geclassificeerd.

### B. Edge Function: nieuwe helper `extractDiplomaNiveau()`
Parseert het MBO/HBO niveaunummer uit een diploma-naam (bijv. "2" uit "Mbo Helpende Zorg en Welzijn 2"). Wordt na `deriveFunctieNiveauFromDiplomas()` geplaatst. Voorbereid voor toekomstig gebruik.

### C. Nieuwe utility: `src/lib/functieNiveau.ts`
Gedeelde mapping van functie_niveau naar niveaunummer + `formatFunctieNiveau()` die bijv. "Persoonlijk begeleider (nv4)" retourneert.

### D. ProfessionalCard: niveau tonen
- Card body (regel 178): `formatFunctieNiveau(professional.functie_niveau)`
- Hover card badge (regel 326): idem

### E. ProfessionalDetailModal: niveau tonen
- Badge (regel 468): `formatFunctieNiveau(professional.functie_niveau)`

### F. SQL migratie: Sociaal werker 4 corrigeren
UPDATE professionals van "Begeleider" naar "Persoonlijk begeleider" waar het diploma `sociaal.*werker\s*4` bevat.

### G. DiplomaLevelMismatchAlert: labels updaten
`getNiveauLabel()` (regel 274-283) wordt bijgewerkt met correcte MBO niveaus en nv-nummers.

## Technische details

### Bestanden
- **Gewijzigd:** `supabase/functions/bendy-sync/index.ts` (wijzigingen A, B)
- **Nieuw:** `src/lib/functieNiveau.ts` (wijziging C)
- **Gewijzigd:** `src/components/recruitment/ProfessionalCard.tsx` (wijziging D)
- **Gewijzigd:** `src/components/ProfessionalDetailModal.tsx` (wijziging E)
- **Nieuw:** SQL migratie (wijziging F)
- **Gewijzigd:** `src/components/recruitment/DiplomaLevelMismatchAlert.tsx` (wijziging G)

### Verwacht resultaat
- ~26 professionals verschuiven van "Begeleider" naar "Persoonlijk begeleider"
- Alle professionals tonen niveaunummer in de UI (bijv. "VIG (nv3) . ZZP")
- Toekomstige syncs classificeren sociaal werker 4 correct

