
# Verwijderen-knop toevoegen aan TaskDetailModal

## Wat wordt er gedaan

Een "Verwijderen" knop toevoegen aan het TaskDetailModal zodat gebruikers taken ook vanuit de detailweergave kunnen soft-deleten, met bevestigingsdialog en undo-toast.

## Wijzigingen

### Bestand: `src/components/TaskDetailModal.tsx`

**1. Nieuwe state variabelen (rond regel 132-136)**
- `confirmDeleteOpen` (boolean) - voor de bevestigingsdialog
- `deleting` (boolean) - loading state

**2. Nieuwe `handleConfirmDelete` functie (na `undoComplete`, rond regel 643)**
- Soft delete: `UPDATE tasks SET deleted_at = now(), deleted_by = user.id WHERE id = task.id`
- Toast met "Ongedaan maken" knop die `deleted_at` en `deleted_by` terugzet naar `null`
- Modal sluiten + `onTaskUpdated()` aanroepen

**3. Quick Actions grid uitbreiden (regels 810-871)**
- Grid wijzigen van `grid-cols-3` naar `grid-cols-4`
- Verwijderen-knop toevoegen als vierde kolom:
  - Ghost variant, Trash2 icon
  - Tekst: "Verwijderen"
  - Kleur: `text-muted-foreground`, hover: `text-destructive hover:bg-destructive/10`

**4. Bevestigingsdialog toevoegen (bij bestaande AlertDialog, rond regel 1460)**
- Titel: "Opdracht verwijderen"
- Tekst: "Weet je zeker dat je deze opdracht wilt verwijderen? Je kunt de opdracht later terugvinden bij Verwijderde Taken."
- Annuleren (outline) + Verwijderen (destructive) knoppen

## Geen database wijzigingen nodig
De `deleted_at` en `deleted_by` kolommen bestaan al op de `tasks` tabel.

## Technisch overzicht

| Onderdeel | Detail |
|-----------|--------|
| Bestand | `src/components/TaskDetailModal.tsx` |
| Nieuwe imports | Geen (Trash2, AlertDialog al geimporteerd) |
| Soft delete logica | Identiek aan Dashboard.tsx patroon |
| Undo mechanisme | Toast met 8s window, zelfde als "Taak Afronden" |
