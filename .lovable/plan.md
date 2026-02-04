
# Fase 4.1: Context-Colored Hover Completion

## Overzicht

Afronden van de context-colored hover implementatie door de laatste twee pagina's bij te werken die nog geen of inline hover styling hebben.

---

## Wijzigingen

### 1. AfgerondeTaken.tsx

**Locatie:** Regel 158 in de `renderTasksTable` functie

**Huidige code:**
```tsx
<TableRow key={task.id} className={showLateIndicator ? "bg-destructive/5" : ""}>
```

**Nieuwe code:**
```tsx
<TableRow key={task.id} className={cn(
  "table-row-hover-emerald",
  showLateIndicator && "bg-destructive/5"
)}>
```

**Extra:** Import `cn` toevoegen aan de imports (van `@/lib/utils`)

---

### 2. Facturatie.tsx

**Locatie:** Regel 479-481

**Huidige code:**
```tsx
<TableRow
  key={factuur.id}
  className="cursor-pointer hover:bg-tab-facturatie-50/50 dark:hover:bg-tab-facturatie-900/30 transition-colors duration-200"
```

**Nieuwe code:**
```tsx
<TableRow
  key={factuur.id}
  className="cursor-pointer table-row-hover-emerald"
```

*De `transition-colors duration-200` wordt al geleverd door de base TableRow component.*

---

## Samenvatting

| Bestand | Regel | Wijziging |
|---------|-------|-----------|
| `AfgerondeTaken.tsx` | 1, 158 | +import cn, +table-row-hover-emerald |
| `Facturatie.tsx` | 479-481 | Inline hover → table-row-hover-emerald |

**Impact:** 2 edits voor volledige design system compliance
