
# P1 UX Verfijningen: WhatsApp Groepsleden

## Status: ✅ VOLTOOID (2026-02-01)

## Overzicht
Accessibility en UX polish toegevoegd aan de groepsleden lijst in het groepsprofiel paneel.

---

## Geïmplementeerde Wijzigingen

### WhatsAppGroupProfile.tsx

| Verbetering | Status |
|-------------|--------|
| Tooltip "Open privé gesprek" | ✅ |
| ARIA labels (`role`, `tabIndex`, `aria-label`) | ✅ |
| Keyboard navigatie (Enter/Spatie) | ✅ |
| Visuele differentiatie (`opacity-75`) | ✅ |
| Klik feedback (`active:scale-[0.98]`) | ✅ |
| `useCallback` optimalisatie | ✅ |

---

## Resultaat

| Aspect | Voor | Na |
|--------|------|-----|
| Tooltip | Geen | "Open privé gesprek" bij hover |
| Keyboard | Niet navigeerbaar | Tab + Enter/Spatie werkt |
| Screen reader | Geen context | "Open privé gesprek met K" |
| Visuele feedback | Geen | Scale animatie bij klik |
| Differentiatie | Subtiel | Duidelijke opacity voor niet-klikbaar |
