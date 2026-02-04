
# Fase 5: Premium Polish - Animated Effects & Tactile Feedback

## Overzicht

Dit is de verfijningsfase die de "Apple visionOS" premium-esthetiek versterkt door strategische animaties en interactie-feedback toe te voegen aan de belangrijkste UI-elementen.

---

## Huidige Status (Audit Resultaten)

| Element | Status | Actie Nodig |
|---------|--------|-------------|
| Button `active:scale-[0.98]` | Aanwezig | Geen |
| `glass-light-sweep` CSS | Gedefinieerd (15s animatie) | Toepassen op KPI cards |
| `glass-specular-premium` | Gedefinieerd, z-index gefixed | Toepassen op PageHero icon |
| Input focus rings | Indigo hardcoded | Context-aware maken |
| KPI card hover | Alleen shadow lift | Light sweep toevoegen |

---

## Wijzigingen

### 1. KPI Card - Animated Light Sweep

**Bestand:** `src/components/ui/kpi-card.tsx`

**Wijziging:** Voeg `glass-light-sweep` toe aan non-minimal KPI cards voor een subtiele 15s animated light reflection.

**Huidige code (regel 210-218):**
```tsx
: cn(
    "glass-liquid-card",
    liquidCardClass,
    "bg-white/75 dark:bg-slate-900/70 backdrop-blur-xl",
    "border border-white/60 dark:border-white/15",
    config.borderColor,
    "border-t-4"
  ),
```

**Nieuwe code:**
```tsx
: cn(
    "glass-liquid-card",
    liquidCardClass,
    "glass-light-sweep",
    "bg-white/75 dark:bg-slate-900/70 backdrop-blur-xl",
    "border border-white/60 dark:border-white/15",
    config.borderColor,
    "border-t-4"
  ),
```

---

### 2. PageHero Icon Container - Specular Premium

**Bestand:** `src/components/ui/page-hero.tsx`

**Wijziging:** Voeg `glass-specular-premium` toe aan de icon container voor extra materiaal-realisme.

**Huidige code (regel 48-52):**
```tsx
<div className={cn(
  "p-2 rounded-xl",
  "bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm",
  "border border-white/40 dark:border-white/10",
  "glass-inner-glow-3layer"
)}>
```

**Nieuwe code:**
```tsx
<div className={cn(
  "p-2 rounded-xl",
  "bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm",
  "border border-white/40 dark:border-white/10",
  "glass-inner-glow-3layer glass-specular-premium"
)}>
```

---

### 3. Context-Aware Focus Rings voor Inputs

**Bestand:** `src/index.css`

**Wijziging:** Nieuwe utility classes voor context-gekleurde focus rings met Spring Physics.

**Locatie:** Na de bestaande `.glass-focus-ring` definitie (rond regel 918)

**Toe te voegen:**
```css
/* ============================================
   CONTEXT-AWARE FOCUS RINGS
   Spring Physics focus met module-specifieke kleuren
   ============================================ */

.focus-ring-rose:focus-visible {
  --tw-ring-color: hsla(345, 48%, 52%, 0.25);
  border-color: hsla(345, 48%, 52%, 0.5);
  box-shadow: 
    0 0 0 3px hsla(345, 48%, 52%, 0.1),
    inset 0 1px 2px rgba(0,0,0,0.06);
}

.focus-ring-violet:focus-visible {
  --tw-ring-color: hsla(270, 45%, 55%, 0.25);
  border-color: hsla(270, 45%, 55%, 0.5);
  box-shadow: 
    0 0 0 3px hsla(270, 45%, 55%, 0.1),
    inset 0 1px 2px rgba(0,0,0,0.06);
}

.focus-ring-teal:focus-visible {
  --tw-ring-color: hsla(174, 42%, 43%, 0.25);
  border-color: hsla(174, 42%, 43%, 0.5);
  box-shadow: 
    0 0 0 3px hsla(174, 42%, 43%, 0.1),
    inset 0 1px 2px rgba(0,0,0,0.06);
}

.focus-ring-emerald:focus-visible {
  --tw-ring-color: hsla(142, 55%, 45%, 0.25);
  border-color: hsla(142, 55%, 45%, 0.5);
  box-shadow: 
    0 0 0 3px hsla(142, 55%, 45%, 0.1),
    inset 0 1px 2px rgba(0,0,0,0.06);
}

.focus-ring-amber:focus-visible {
  --tw-ring-color: hsla(38, 55%, 50%, 0.25);
  border-color: hsla(38, 55%, 50%, 0.5);
  box-shadow: 
    0 0 0 3px hsla(38, 55%, 50%, 0.1),
    inset 0 1px 2px rgba(0,0,0,0.06);
}

.focus-ring-indigo:focus-visible {
  --tw-ring-color: hsla(234, 45%, 52%, 0.25);
  border-color: hsla(234, 45%, 52%, 0.5);
  box-shadow: 
    0 0 0 3px hsla(234, 45%, 52%, 0.1),
    inset 0 1px 2px rgba(0,0,0,0.06);
}

.focus-ring-slate:focus-visible {
  --tw-ring-color: hsla(215, 25%, 48%, 0.25);
  border-color: hsla(215, 25%, 48%, 0.5);
  box-shadow: 
    0 0 0 3px hsla(215, 25%, 48%, 0.1),
    inset 0 1px 2px rgba(0,0,0,0.06);
}

.focus-ring-blue:focus-visible {
  --tw-ring-color: hsla(217, 91%, 60%, 0.25);
  border-color: hsla(217, 91%, 60%, 0.5);
  box-shadow: 
    0 0 0 3px hsla(217, 91%, 60%, 0.1),
    inset 0 1px 2px rgba(0,0,0,0.06);
}
```

---

### 4. Glass Light Sweep z-index Fix

**Bestand:** `src/index.css`

**Wijziging:** Verhoog z-index naar 0 (was -1) zodat de sweep zichtbaar is boven de achtergrond gradient maar onder de content.

**Locatie:** Regel 3533

**Huidige code:**
```css
z-index: -1; /* GEFIXED: Was z-index: 1 */
```

**Nieuwe code:**
```css
z-index: 0;
```

---

## Samenvatting

| Bestand | Wijziging | Impact |
|---------|-----------|--------|
| `kpi-card.tsx` | +glass-light-sweep class | Animated premium effect op alle KPI cards |
| `page-hero.tsx` | +glass-specular-premium class | Materiaal-realisme op page icons |
| `index.css` | +8 focus-ring-[color] utilities | Context-aware form focus states |
| `index.css` | z-index: -1 → 0 | Light sweep zichtbaar maken |

---

## Visueel Effect

De `glass-light-sweep` animatie creëert een subtiele lichtreflectie die elke 15 seconden over de KPI cards beweegt:
- Simuleert zonlicht dat over een glazen oppervlak beweegt
- Versterkt de "levende" materiaal-kwaliteit
- Respecteert `prefers-reduced-motion` voor accessibility

---

## Technische Details

**Performance:** 
- CSS-only animatie (geen JavaScript)
- `will-change: transform` impliciet via translate
- Pseudo-element met `pointer-events: none`

**Dark Mode:**
- Light sweep werkt in beide modes (wit licht op donker glas = subtiel)
- Focus rings gebruiken HSL met lage saturatie

**Accessibility:**
- `prefers-reduced-motion` disables animaties automatisch
- Focus states blijven volledig zichtbaar
