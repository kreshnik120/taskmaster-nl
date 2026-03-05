

# S41-C1 + S41-C2 — Backend + Frontend Audit Fixes

## C1: Backend Fixes (supabase/functions/bendy-sync/index.ts)

### H1 — Promise.all → Promise.allSettled (regels 266-270)
Vervang `Promise.all` door `Promise.allSettled` met warning logging voor failures.

### H3 — geboortedatum + profile_photo_url in UPDATE path (na regel 1079)
Twee regels toevoegen, zelfde conditioneel patroon als bestaande velden.

### L4 — matchNiveauFromText uitbreiden (regels 404-414)
Voeg `WO` (eerste) en `HBO` standalone (na HBO-V) toe met correcte regex.

---

## C2: Frontend Fixes (meerdere bestanden)

### M5 — Kleur-consistentie: 1 centrale bron

**Stap 1:** `src/types/organization.ts` — Vervang `FUNCTIE_COLORS` (regels 111-119) door `FUNCTIE_NIVEAU_COLORS` met uitgebreide mapping (bg, text, border, solid, selected, outline) + `getFunctieNiveauColor()` helper.

**Stap 2:** Vervang lokale `getFunctieColor` in 4 bestanden + lokale `FUNCTIE_COLORS` in 1 bestand:
1. `ProfessionalDetailModal.tsx` — verwijder regels 112-123, importeer helper
2. `ProfessionalCard.tsx` — verwijder regels 56-67, gebruik `getFunctieNiveauColor(f).solid`
3. `professional-avatar.tsx` — verwijder regels 42-55, gebruik `getFunctieNiveauColor(f).solid`
4. `ApplicationDetailModal.tsx` — verwijder regels 131-141, gebruik bg/text/border
5. `ClientDetailModal.tsx` — verwijder regels 70-78, importeer `FUNCTIE_NIVEAU_COLORS`, gebruik `.selected`/`.outline`
6. `NewClientDialog.tsx` — update import van `FUNCTIE_COLORS` naar `FUNCTIE_NIVEAU_COLORS`

### M3 — Completeness ring 7 → 20 velden
`ProfessionalDetailModal.tsx` regels 639-647 — uitbreiden naar 20 velden (basis/professioneel/bedrijf/documenten/bendy).

### L1 — IBAN maskeren
`ProfessionalDetailModal.tsx` regel 1313 — toon `NL91••••••4567` formaat.

---

## Totaal: 8 bestanden
1. `supabase/functions/bendy-sync/index.ts` (3 fixes)
2. `src/types/organization.ts` (nieuwe centrale mapping)
3. `src/components/ProfessionalDetailModal.tsx` (kleur + completeness + IBAN)
4. `src/components/recruitment/ProfessionalCard.tsx` (kleur)
5. `src/components/ui/professional-avatar.tsx` (kleur)
6. `src/components/ApplicationDetailModal.tsx` (kleur)
7. `src/components/ClientDetailModal.tsx` (kleur)
8. `src/components/NewClientDialog.tsx` (import update)

