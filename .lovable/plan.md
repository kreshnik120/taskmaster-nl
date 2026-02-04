

# Kritische Fixes - Apple Liquid Glass Bugs

## Probleem Analyse

Na onderzoek zijn er **2 kritische bugs** gevonden door de recente Apple Liquid Glass upgrade:

### Bug 1: Sidebar Onzichtbaar op Mobiel (Afbeelding 1)
**Oorzaak:** In `sheet.tsx` (lijn 33) staat nu:
```css
glass-liquid-premium glass-specular-premium
```
Dit zet:
- `background: rgba(255, 255, 255, 0.62)` → te transparant
- `overflow: hidden` → knipt content af
- `::before` pseudo-element met `z-index: 1` → dekt sidebar content af

De sidebar SheetContent (sidebar.tsx lijn 159) heeft `bg-sidebar` maar dit wordt **overschreven** door de `glass-liquid-premium` class.

### Bug 2: Dialog/Modal Potentieel Conflict (Afbeelding 2)
**Oorzaak:** In `dialog.tsx` (lijn 39) staan dezelfde premium classes die conflicteren met het originele dialog systeem.

---

## Fixes

### Fix 1: Sheet.tsx - Herstel Originele Styling
**Bestand:** `src/components/ui/sheet.tsx`

**Wijziging (lijn 32-33):**
```diff
const sheetVariants = cva(
-  "fixed z-50 gap-4 p-6 transition ease-in-out glass-liquid-premium glass-specular-premium data-[state=open]:animate-in ...",
+  "fixed z-50 gap-4 p-6 transition ease-in-out bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-white/40 dark:border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.12)] data-[state=open]:animate-in ...",
```

### Fix 2: Dialog.tsx - Herstel Compatibele Styling
**Bestand:** `src/components/ui/dialog.tsx`

**Wijziging (lijn 38-40):**
```diff
className={cn(
-  "... glass-liquid-premium glass-specular-premium glass-noise-texture",
+  "... bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-white/40 dark:border-white/15 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15),0_4px_16px_rgba(0,0,0,0.1)]",
  className,
)}
```

### Fix 3: CSS - Voeg `!important` Override toe voor Sheet/Dialog
**Bestand:** `src/index.css`

**Toevoegen aan einde:**
```css
/* Fix: Sheet en Dialog moeten solide achtergrond behouden */
[data-sidebar="sidebar"],
.sheet-content-override {
  background: hsl(var(--sidebar-background)) !important;
  backdrop-filter: blur(20px) !important;
}
```

---

## Samenvatting

| Bestand | Wijziging |
|---------|-----------|
| `src/components/ui/sheet.tsx` | Verwijder `glass-liquid-premium glass-specular-premium`, herstel originele styling |
| `src/components/ui/dialog.tsx` | Verwijder `glass-liquid-premium glass-specular-premium glass-noise-texture`, herstel originele styling |
| `src/index.css` | Optioneel: voeg sidebar override toe |

**Geschatte tijd:** 5 minuten

Dit herstelt de sidebar en modals naar werkende staat terwijl de premium glaseffecten op andere componenten (KPI cards, tabs, page heroes) behouden blijven.

