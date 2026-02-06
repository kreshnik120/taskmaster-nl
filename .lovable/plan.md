

# Vereenvoudiging InlineDescriptionEditor

## Huidige Situatie

De editor toont nu keyboard shortcut hints (`Ctrl+Enter`, `Esc`) die niet nodig zijn. De opslaan-knop is alleen een icoon (✓).

## Wijziging

Verwijder de keyboard hints en maak de knoppen duidelijker met tekst:

```text
VOOR:
┌────────────────────────────────────────────────────────────┐
│ [Ctrl+Enter] Opslaan   [Esc] Annuleren    [✖] [✓]          │
└────────────────────────────────────────────────────────────┘

NA:
┌────────────────────────────────────────────────────────────┐
│ Niet-opgeslagen wijzigingen      [Annuleren] [Opslaan]     │
└────────────────────────────────────────────────────────────┘
```

## Technische Aanpassing

**Bestand:** `src/components/InlineDescriptionEditor.tsx`

**Wijzigingen:**
1. Verwijder de keyboard shortcut hints (regels 160-172)
2. Vervang icoon-knoppen met tekstknoppen "Annuleren" en "Opslaan"
3. Behoud keyboard shortcuts in de code (ze werken nog steeds, maar worden niet getoond)

