

# Fase 4: CSS Cleanup & Extended Context-Colored Hovers

## Samenvatting

Na voltooiing van Fase 1-3 zijn er twee prioriteiten voor Fase 4:

1. **CSS Cleanup**: Verwijderen van dubbele `table-row-hover-*` definities
2. **Extended Context-Colored Hovers**: Toepassen op pagina's die nog generic hovers gebruiken

---

## Deel A: CSS Cleanup

### Probleem Geïdentificeerd

In `src/index.css` zijn er **dubbele definities** voor `table-row-hover-*` classes:

| Locatie | Regels | Type |
|---------|--------|------|
| Eerste definitie | 1026-1094 | Binnen `@layer base` - alleen transition + background |
| Tweede definitie | 2758-2816 | Buiten layers - met extra `box-shadow: inset` |

De tweede definitie (regels 2758-2816) is **redundant** en heeft een iets ander ontwerp (met inset box-shadow). Dit moet worden samengevoegd.

### Aanbevolen Actie

Verwijder de dubbele definities (regels 2754-2816) en voeg de `box-shadow: inset` toe aan de eerste definitie voor een gecombineerd premium effect.

---

## Deel B: Extended Context-Colored Hovers

### Pagina's met Generic Hovers

| Pagina | Huidige | Aanbevolen | Context |
|--------|---------|------------|---------|
| `Notulen.tsx` | `hover:bg-muted/50` (regel 338) | `table-row-hover-indigo` | Dashboard/Notes context |
| `Gebruikers.tsx` | geen hover class | `table-row-hover-violet` | Team/Users context |
| `VerwijderdeTaken.tsx` | geen hover class | `table-row-hover-indigo` | Taken context |
| `AfgerondeTaken.tsx` | geen hover class | `table-row-hover-indigo` | Taken context |

### Collapsibles die Upgrade Nodig Hebben

| Component | Huidige | Aanbevolen |
|-----------|---------|------------|
| `DocumentAuditHistory.tsx` (regel 162) | `hover:bg-muted/50` | `collapsible-glass collapsible-glass-rose` |
| `PipelineAnalyticsWidget.tsx` (regel 62-79) | Button variant="ghost" | `collapsible-glass collapsible-glass-rose` |
| `RecentClientsWidget.tsx` (regel 95) | geen glass styling | `collapsible-glass` |
| `Professionals.tsx` (regel 586) | Button variant="outline" | Behouden (filter-specifiek) |

---

## Wijzigingen per Bestand

### 1. `src/index.css` - CSS Cleanup

**Verwijderen:** Regels 2754-2816 (dubbele table-row-hover definities)

**Toevoegen aan eerste definitie (regels 1026-1094):** Subtiele inset box-shadow voor premium feel:

```css
.table-row-hover-rose:hover {
  background: hsla(345, 48%, 97%, 0.7);
  box-shadow: inset 0 0 0 1px hsla(345, 48%, 88%, 0.35);
}
```

### 2. `src/pages/Notulen.tsx`

| Regel | Huidige | Nieuwe |
|-------|---------|--------|
| 338 | `hover:bg-muted/50` | `table-row-hover-indigo` |

### 3. `src/pages/Gebruikers.tsx`

| Regels | Wijziging |
|--------|-----------|
| 342, 427 | Toevoegen `table-row-hover-violet` aan TableRow |

### 4. `src/pages/VerwijderdeTaken.tsx`

| Regel | Wijziging |
|-------|-----------|
| 255 | Toevoegen `table-row-hover-indigo` aan TableRow |

### 5. `src/pages/AfgerondeTaken.tsx`

Onderzoeken of er TableRows zijn die context-colored hover nodig hebben.

### 6. `src/components/recruitment/DocumentAuditHistory.tsx`

| Regel | Huidige | Nieuwe |
|-------|---------|--------|
| 162 | `hover:bg-muted/50` | `collapsible-glass collapsible-glass-rose` |

### 7. `src/components/recruitment/RecentClientsWidget.tsx`

| Regel | Huidige | Nieuwe |
|-------|---------|--------|
| 95 | `hover:text-foreground` | `collapsible-glass hover:text-foreground` |

---

## Technische Details

### CSS Cascade

De tweede definitie (buiten @layer) heeft hogere specificiteit dan de eerste (binnen @layer base). Door deze te verwijderen en de styling te consolideren in de eerste definitie, wordt het CSS bestand:
- ~60 regels korter
- Consistenter qua specificiteit
- Makkelijker te onderhouden

### Performance

Geen impact - we verwijderen alleen redundante code.

### Dark Mode

Alle wijzigingen behouden de bestaande dark mode variants.

---

## Samenvatting

| Bestand | Type Wijziging | Impact |
|---------|----------------|--------|
| `src/index.css` | Cleanup + enhance | -60 regels, +8 box-shadows |
| `src/pages/Notulen.tsx` | Context-colored hover | 1 edit |
| `src/pages/Gebruikers.tsx` | Context-colored hover | 2 edits |
| `src/pages/VerwijderdeTaken.tsx` | Context-colored hover | 1 edit |
| `DocumentAuditHistory.tsx` | Glass collapsible | 1 edit |
| `RecentClientsWidget.tsx` | Glass collapsible | 1 edit |

**Totaal: 6 bestanden, ~8 edits**

---

## Verwacht Resultaat

Na implementatie:
- Schonere CSS codebase zonder duplicaten
- Alle tabellen met data-rijen hebben context-colored hovers
- Alle recruitment collapsibles hebben glass styling
- Consistente enterprise-grade UX door de hele applicatie

