
# Fase 3: Context-Colored Table Rows & Collapsible Triggers Enhancement

## Analyse van Huidige Status

Na Fase 1 (Foundation) en Fase 2 (WhatsApp Glass Enhancement) is het design system consistent. De volgende logische stap is het toepassen van **context-gekleurde hover states** op tabelrijen en collapsible triggers door de hele applicatie.

### Wat al aanwezig is:
| Component | Status | Details |
|-----------|--------|---------|
| Table sticky headers | Volledig | `bg-white/70 dark:bg-slate-900/70 backdrop-blur-md sticky top-0 z-10` |
| ApplicationCard | Volledig | `glass-hover-lift` + rose-tinted shadow `hsla(346,77%,50%,...)` |
| ClientCard | Volledig | `glass-hover-lift` + slate-tinted shadow |
| TaskCard | Volledig | `glass-task-card glass-hover-lift` + indigo-tinted shadow |
| WhatsApp Chat Items | Volledig (Fase 2) | `glass-list-item-blue` + tactile feedback |

### Wat ontbreekt (Fase 3 scope):

1. **TableRow Default Hover** - Generiek `hover:bg-muted/50` ipv context-colored
   - Huidige: `hover:bg-muted/50` (neutral)
   - Ontbreekt: Per-pagina context-colored hover met subtiele glow

2. **CollapsibleTrigger Hovers** - Flat `hover:bg-muted/50` styling
   - `ProfessionalDetailModal.tsx`: 4 collapsibles met flat hover
   - `TaskDetailModal.tsx`: 5 collapsibles met flat hover
   - `OrganizationSection.tsx`: 1 collapsible met flat hover
   - Ontbreekt: Glass-achtige hover met context shadow

3. **Tijdregistratie TableRow** - Hardcoded neutral hover
   - `hover:bg-muted/50` op regel 544

---

## Implementatie Plan

### Optie A: CSS Utility Classes (Aanbevolen)
Nieuwe utility classes toevoegen voor context-colored hovers:

```css
/* Context-colored table row hovers */
.table-row-hover-rose:hover { background: hsla(346, 77%, 96%, 0.6); }
.table-row-hover-violet:hover { background: hsla(270, 50%, 96%, 0.6); }
.table-row-hover-amber:hover { background: hsla(38, 92%, 96%, 0.6); }
.table-row-hover-indigo:hover { background: hsla(234, 89%, 96%, 0.6); }
.table-row-hover-emerald:hover { background: hsla(142, 71%, 96%, 0.6); }

/* Collapsible trigger glass hovers */
.collapsible-glass:hover {
  background: rgba(255, 255, 255, 0.60);
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
```

### Optie B: Per-Component Inline Styling
Direct toepassen op elk component met context-specifieke kleuren.

---

## Wijzigingen per Bestand

### 1. `src/index.css` - Nieuwe Utility Classes

| Toevoeging | Doel |
|------------|------|
| `.table-row-hover-rose` | Recruitment tabellen (sollicitaties) |
| `.table-row-hover-violet` | Team tabellen |
| `.table-row-hover-amber` | Tijdregistratie/Opvolging tabellen |
| `.table-row-hover-indigo` | Taken/Kanban tabellen |
| `.table-row-hover-emerald` | Facturatie/Plaatsingen tabellen |
| `.collapsible-glass` | Alle collapsible triggers |
| `.collapsible-glass-rose` | Rose-context collapsibles |
| `.collapsible-glass-violet` | Violet-context collapsibles |

### 2. `src/components/ui/table.tsx` - Default TableRow Enhancement

| Regel | Wijziging |
|-------|-----------|
| 53 | Voeg Spring Physics transition toe: `transition-all duration-200` |
| 53 | Verhoog hover opacity: `hover:bg-muted/60` → betere zichtbaarheid |

### 3. `src/pages/Tijdregistratie.tsx` - Context-Colored Row

| Regel | Huidige | Nieuwe |
|-------|---------|--------|
| 544 | `hover:bg-muted/50` | `table-row-hover-amber` |

### 4. `src/components/ProfessionalDetailModal.tsx` - Glass Collapsibles

| Regels | Wijziging |
|--------|-----------|
| 472, 511, 640, 745 | `hover:bg-muted/50` → `collapsible-glass collapsible-glass-rose` |

### 5. `src/components/TaskDetailModal.tsx` - Glass Collapsibles

| Regels | Wijziging |
|--------|-----------|
| 1034, 1058, 1104, 1140, 1224 | `hover:bg-muted/20` → `collapsible-glass collapsible-glass-indigo` |

### 6. `src/components/recruitment/OrganizationSection.tsx` - Glass Collapsible

| Regel | Wijziging |
|-------|-----------|
| 96 | `hover:bg-muted/50` → `collapsible-glass` |

---

## Visuele Veranderingen

### Before & After: Table Row

```text
BEFORE:
┌─────────────────────────────────────────────┐
│ Taak Naam    │ 2:30 uur │ Vandaag           │ ← Flat gray hover
└─────────────────────────────────────────────┘

AFTER:
┌─────────────────────────────────────────────┐
│ Taak Naam    │ 2:30 uur │ Vandaag           │ ← Amber-tinted hover (38°)
└─────────────────────────────────────────────┘   + Subtiele glow
```

### Before & After: Collapsible Trigger

```text
BEFORE:
┌──────────────────────────────────────────────┐
│ ▶ Contactgegevens                    ▼      │ ← Flat muted hover
└──────────────────────────────────────────────┘

AFTER:
┌──────────────────────────────────────────────┐
│ ▶ Contactgegevens                    ▼      │ ← Glass backdrop-blur
└──────────────────────────────────────────────┘   + Rose shadow glow
```

---

## CSS Implementatie Details

### Nieuwe Classes in index.css

```css
/* ============================================
   CONTEXT-COLORED TABLE ROW HOVERS
   Per-module semantic hover colors
   ============================================ */

.table-row-hover-rose {
  transition: background 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}
.table-row-hover-rose:hover {
  background: hsla(346, 77%, 97%, 0.7);
}
.dark .table-row-hover-rose:hover {
  background: hsla(346, 50%, 15%, 0.4);
}

.table-row-hover-amber {
  transition: background 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}
.table-row-hover-amber:hover {
  background: hsla(38, 92%, 97%, 0.7);
}
.dark .table-row-hover-amber:hover {
  background: hsla(38, 50%, 15%, 0.4);
}

/* Similar patterns for violet, indigo, emerald, teal, blue */

/* ============================================
   GLASS COLLAPSIBLE TRIGGERS
   Premium hover for accordion headers
   ============================================ */

.collapsible-glass {
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.collapsible-glass:hover {
  background: rgba(255, 255, 255, 0.50);
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}

.dark .collapsible-glass:hover {
  background: rgba(30, 41, 59, 0.50);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* Context-colored variants */
.collapsible-glass-rose:hover {
  box-shadow: 0 2px 8px hsla(346, 77%, 50%, 0.06);
}

.collapsible-glass-indigo:hover {
  box-shadow: 0 2px 8px hsla(234, 89%, 50%, 0.06);
}
```

---

## Technische Details

### Performance
- `backdrop-filter: blur(4px)` is zeer licht (half van de 8px in WhatsApp)
- Geen `will-change` nodig voor deze subtiele hovers
- Spring Physics timing consistent met Fase 1 & 2

### Dark Mode
- Alle nieuwe classes hebben dark mode variants
- HSL saturation verlaagd naar 50% in dark mode (conform design constraints)

### Toegankelijkheid
- Hover states zijn visuele enhancement, geen functionele afhankelijkheid
- Focus states blijven ongewijzigd (keyboard navigatie intact)

---

## Samenvatting Bestanden

| Bestand | Type Wijziging | Aantal Edits |
|---------|----------------|--------------|
| `src/index.css` | Toevoegen utility classes | +50 regels |
| `src/components/ui/table.tsx` | TableRow transition | 1 edit |
| `src/pages/Tijdregistratie.tsx` | Context-colored hover | 1 edit |
| `src/components/ProfessionalDetailModal.tsx` | Glass collapsibles | 4 edits |
| `src/components/TaskDetailModal.tsx` | Glass collapsibles | 5 edits |
| `src/components/recruitment/OrganizationSection.tsx` | Glass collapsible | 1 edit |

**Totaal: 6 bestanden, ~12 edits**

---

## Verwacht Resultaat

Na implementatie:
- Alle tabellen hebben context-colored row hovers passend bij hun module
- Alle collapsible sections hebben premium glass hover effect
- Consistente Spring Physics timing door de hele applicatie
- Volledig dark mode compatible
- Enterprise-niveau polish in detail-modals

Dit completeert de "micro-interaction polish" laag van het design system.
