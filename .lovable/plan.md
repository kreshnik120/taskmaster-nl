
# Verbeterplan - Apple Liquid Glass Stabilisatie Fase 2

## Geïdentificeerde Problemen

Na grondige analyse van de codebase heb ik de volgende problemen gevonden die nog moeten worden opgelost:

### Probleem 1: Sonner (Toast Notificaties)
**Bestand:** `src/components/ui/sonner.tsx` lijn 13
**Issue:** Heeft nog steeds `glass-liquid-premium glass-specular-premium` classes die dezelfde `overflow: hidden` en `::before` pseudo-element issues kunnen veroorzaken als bij de sidebar en dialog.

### Probleem 2: TaskDetailModal Dialog Content
**Bestand:** `src/components/TaskDetailModal.tsx` lijn 722
**Issue:** Gebruikt `glass-layer-2 glass-light-bleed` wat conflicteert met de nieuwe `DialogContent` base styling. Dit is waarschijnlijk de oorzaak van het probleem in afbeelding 2.

---

## Oplossingen

### Fix 1: Sonner.tsx - Verwijder Premium Glass Classes
**Wijziging (lijn 12-13):**
```tsx
// VAN:
toast: "group toast glass-liquid-premium glass-specular-premium group-[.toaster]:text-foreground group-[.toaster]:rounded-xl",

// NAAR:
toast: "group toast group-[.toaster]:bg-white/90 dark:group-[.toaster]:bg-slate-900/90 group-[.toaster]:backdrop-blur-2xl group-[.toaster]:border-white/40 dark:group-[.toaster]:border-white/15 group-[.toaster]:shadow-[0_8px_32px_rgba(0,0,0,0.12)] group-[.toaster]:text-foreground group-[.toaster]:rounded-xl",
```

### Fix 2: TaskDetailModal.tsx - Verwijder Conflicterende Glass Classes
**Wijziging (lijn 722):**
```tsx
// VAN:
<DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto glass-layer-2 glass-light-bleed">

// NAAR:
<DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
```
De `DialogContent` heeft nu al de correcte base styling, dus extra glass classes zijn niet nodig en veroorzaken alleen conflicten.

---

## Samenvatting

| Bestand | Wijziging | Reden |
|---------|-----------|-------|
| `src/components/ui/sonner.tsx` | Vervang premium glass met stabiele inline styling | Voorkomt `::before` overlay issues op toasts |
| `src/components/TaskDetailModal.tsx` | Verwijder `glass-layer-2 glass-light-bleed` | Conflicteert met `DialogContent` base styling |

---

## Wat Is Al Correct

De volgende fixes zijn correct geïmplementeerd en werken:

| Component | Status |
|-----------|--------|
| `sheet.tsx` | ✅ Correct - stabiele styling |
| `dialog.tsx` | ✅ Correct - stabiele styling |
| `alert-dialog.tsx` | ✅ Correct - stabiele styling |
| CSS sidebar override | ✅ Correct - `!important` override |

---

## Verwacht Resultaat

Na deze 2 fixes zullen:
- **Toast notificaties** correct zichtbaar zijn zonder overlay issues
- **TaskDetailModal** (afbeelding 2) correct renderen zonder styling conflicten
- **Sidebar** (afbeelding 1) correct blijven werken (al gefixt)

De premium "Apple Liquid Glass" effecten blijven actief op:
- Dashboard tab containers
- KPI cards
- PageHero componenten
- Alle plaatsen waar `glass-specular-premium` bewust is toegepast zonder `overflow: hidden` conflicten
