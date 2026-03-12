

# BENDY-REQ-5B: Toewijzingen koppelen aan diensten

## Overzicht
Na de requisition sync worden toewijzingen (dienst_toewijzingen) aangemaakt voor bezette diensten door de flex_user_company relatie uit Bendy te matchen met lokale professionals.

## Wijzigingen

### 1. Edge function (`supabase/functions/bendy-sync/index.ts`)

**A. Assigned fetch uitbreiden (regel ~1661)**
- `include: 'flex_user_company'` toevoegen aan de assigned requisitions fetch

**B. Matching maps bouwen (na STAP 2, rond regel 1699)**
- `fucMap`: flex_user_company ID → user bendy_id (uit `assignedResult.included`)
- `profMap`: professional bendy_id → `{ id, name }` (uit `professionals` tabel, limit 50000)
- Bestaande toewijzingen pre-fetch in chunks van 500 → `Set<"dienst_id|professional_id">` voor idempotentie
- Fallback: als `fucMap` leeg is, vul vanuit `bendy_raw_cache` (entity_type='users')
- Diagnostische checkpoints: `2B-FUC-MAP`, `2C-PROF-MAP`, `2D-EXISTING-TW`

**C. Na STAP 4 (na regel 1921, checkpoint 4-GESCHREVEN): toewijzingen aanmaken**
- Loop door `allRecords`, check `relationships.flex_user_company.data.id`
- Keten: fucMap → userBendyId → profMap → professional
- Skip als combinatie al in `existingToewijzingen` Set zit (idempotent)
- Insert met status `bevestigd`, positie_nr 1, notitie met flex_user_company ID
- Overlap trigger fouten opvangen als warning, niet crashen
- Stats: `{ created, skipped, noMatch, overlapError }`
- Checkpoint `5-TOEWIJZINGEN`

**D. Resultaat uitbreiden**
- Voeg `toewijzingen_created`, `toewijzingen_skipped`, `toewijzingen_no_match`, `toewijzingen_overlap` toe aan het return object (als extra velden op `result`)

**E. dienstMap bijwerken na upsert**
- Na de diensten upsert (regel 1901-1909) moeten nieuw-aangemaakte diensten ook in `dienstMap` staan zodat toewijzingen het `dienst.id` kunnen vinden
- Update bestaande loop die al `mapping.local_id` zet om ook `dienstMap` bij te werken

### 2. Frontend (`src/pages/BendySync.tsx`)

**A. SyncResult interface uitbreiden**
- 4 optionele velden: `toewijzingen_created?`, `toewijzingen_skipped?`, `toewijzingen_no_match?`, `toewijzingen_overlap?`

**B. Resultaat grid uitbreiden (rond regel 1390)**
- 4 extra stats onder de bestaande 5:
  - Toewijzingen aangemaakt (groen)
  - Toewijzingen overgeslagen (grijs)
  - Toewijzingen geen match (oranje)
  - Toewijzingen overlap (rood)
- Alleen tonen als minstens 1 veld > 0

### Niet aanraken
- Overlap trigger (`trg_check_overlap`)
- Cleanup functie en knop
- Andere sync functies
- Database schema

### Technische details
- De `dienstMap` wordt aangevuld met IDs uit de upsert response zodat ook nieuw-aangemaakte diensten toewijzingen krijgen
- Toewijzingen worden 1-voor-1 geïnsert (niet batch) vanwege de overlap trigger die per-row valideert
- De fallback via `bendy_raw_cache` garandeert dat zelfs zonder `include` support de matching werkt

