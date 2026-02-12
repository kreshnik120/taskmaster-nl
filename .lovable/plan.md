

# Kwaliteitsaudit Fixes (10 issues)

## Overzicht
Tien backwards-compatible fixes voor de planning module: database constraints, verwijdering van `window.prompt()`/`confirm()`, validatie, accessibility en UX-verbeteringen.

## Stap 1: Database Migratie -- 3 CHECK constraints

```sql
ALTER TABLE diensten ADD CONSTRAINT chk_gevraagd_aantal CHECK (gevraagd_aantal > 0);
ALTER TABLE diensten ADD CONSTRAINT chk_pauze_minuten CHECK (pauze_minuten >= 0 AND pauze_minuten <= 480);
ALTER TABLE dienst_toewijzingen ADD CONSTRAINT chk_positie_nr_positive CHECK (positie_nr > 0);
```

Alle bestaande data voldoet al (defaults zijn 1, 0 en 1 respectievelijk).

## Stap 2: NieuweDienstModal.tsx -- 5 fixes

### A. `window.prompt()` vervangen door AlertDialog
- Nieuwe states: `templateNaamInput`, `showTemplateSaveDialog`
- "Opslaan als template" knop opent een AlertDialog met Input veld
- `handleSaveAsTemplate` krijgt een `naam: string` parameter i.p.v. `window.prompt()`

### B. `confirm()` vervangen door AlertDialog voor template delete
- Nieuwe state: `deleteTemplateTarget`
- Trash knop zet `deleteTemplateTarget` i.p.v. direct `confirm()`
- AlertDialog met bevestiging roept `handleDeleteTemplate` aan

### C. Template data validatie
- In `handleLoadTemplate`: type check toevoegen op `tmpl.template_data`
- Bij ongeldige data: `toast.error("Template data is ongeldig")` en return

### D. gevraagd_aantal validatie
- In `handleSave`: `gevraagd_aantal: Math.max(1, aantal)`
- In `handleSaveAsTemplate`: idem

### E. Nieuwe states resetten bij sluiten
- `setShowTemplateSaveDialog(false)`, `setTemplateNaamInput("")`, `setDeleteTemplateTarget(null)` in de reset useEffect (regel 302-313)

## Stap 3: ToewijzingenBeheer.tsx -- 2 fixes

### A. selectedPositie reset bij dienst switch
```typescript
useEffect(() => {
  setSelectedPositie(1);
}, [dienst.id]);
```

### B. positie_nr validatie bij toewijzen
```typescript
positie_nr: isMultiPositie ? Math.min(selectedPositie, gevraagd) : 1,
```

## Stap 4: PlanningMaandKalender.tsx -- 3 fixes

### A. Dag-cellen accessibility
- `tabIndex={0}`, `role="gridcell"`, `aria-label` met datum en aantal diensten

### B. "+X meer" klikbaar
- Click handler op "+X meer" tekst die eerste niet-zichtbare dienst opent
- Cursor en hover styling toevoegen

### C. Tekst vergroten
- Dienst items van `text-[9px]` naar `text-[10px]`

## Stap 5: DienstDetailSheet.tsx -- aria-labels

Positie bolletjes krijgen `aria-label` en `role="img"` naast de bestaande `title`.

## Gewijzigde Bestanden
1. Database migratie (nieuw) -- 3 CHECK constraints
2. `src/components/planning/NieuweDienstModal.tsx` -- template dialogs, validatie, reset
3. `src/components/planning/ToewijzingenBeheer.tsx` -- positie reset + validatie
4. `src/components/planning/PlanningMaandKalender.tsx` -- accessibility + tekst
5. `src/components/planning/DienstDetailSheet.tsx` -- aria-labels

