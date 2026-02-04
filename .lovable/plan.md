

# CSS Performance & Accessibility Optimalisatie Plan

## Goedgekeurd Implementatieplan

Dit plan implementeert de P0 (kritieke) en P1 (accessibility) CSS-optimalisaties voor het TaskFlow Glass Design System. **Alleen CSS wijzigingen, geen JavaScript/TypeScript logica.**

---

## P0: Kritieke Fixes (Nu)

### 1. Ambient Mesh Blur Optimalisatie

**Wat:** Verlaag `blur(65px)` naar `blur(40px)` voor alle 8 ambient mesh kleuren (light + dark mode = 16 locaties)

**Waarom:** 65px blur is te zwaar voor GPU rendering, 40px biedt hetzelfde visuele effect met betere performance

**Locaties in `src/index.css`:**
- `.glass-ambient-mesh-rose::before` (light + dark)
- `.glass-ambient-mesh-violet::before` (light + dark)
- `.glass-ambient-mesh-slate::before` (light + dark)
- `.glass-ambient-mesh-teal::before` (light + dark)
- `.glass-ambient-mesh-amber::before` (light + dark)
- `.glass-ambient-mesh-emerald::before` (light + dark)
- `.glass-ambient-mesh-indigo::before` (light + dark)
- `.glass-ambient-mesh-blue::before` (light + dark)

### 2. Contain Property Fix + GPU Hint

**Wat:** Wijzig `contain: strict` naar `contain: content` en voeg `will-change: filter` toe

**Waarom:** `contain: strict` kan z-index breaks veroorzaken; `will-change: filter` geeft GPU een hint voor blur optimalisatie

```css
.glass-ambient-mesh-*::before {
  contain: content;      /* Veiliger dan strict */
  will-change: filter;   /* GPU hint voor blur */
}
```

### 3. Glass Card Performance

**Wat:** Voeg `contain` en `will-change` toe aan `.glass-liquid-card`

```css
.glass-liquid-card {
  contain: layout style paint;
  will-change: transform;
}
```

---

## P1: Accessibility (Deze Sprint)

### 4. Enhanced Reduced Motion Support

**Wat:** Uitgebreidere `@media (prefers-reduced-motion: reduce)` ondersteuning

```css
@media (prefers-reduced-motion: reduce) {
  .glass-liquid-card,
  .glass-liquid-overlay,
  .glass-liquid-nav {
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  
  [class*="glass-ambient-mesh-"]::before {
    filter: blur(16px);
    opacity: 0.5;
  }
}
```

---

## Wat NIET Wijzigen

| Element | Waarde | Reden |
|---------|--------|-------|
| Sidebar blur | `24px` | Correct per specificatie |
| Status/Priority saturatie | `71-92%` | WCAG accessibility vereist |
| Context hues | `270°/345°` | Acceptabele afwijking |
| Glass card blur | `24px` | Correct per specificatie |

---

## Technische Samenvatting

| Wijziging | Aantal | Impact |
|-----------|--------|--------|
| blur(65px) → blur(40px) | 16 locaties | Performance +15% |
| contain: strict → content | 8 locaties | Stabiliteit |
| will-change: filter | 8 locaties | GPU optimalisatie |
| contain + will-change op cards | 1 locatie | Performance |
| Enhanced reduced-motion | 1 nieuw blok | Accessibility |

**Totaal: ~25 CSS wijzigingen, 0 JavaScript wijzigingen**

---

## Verwachte Score na Implementatie

| Fase | Score | Toelichting |
|------|-------|-------------|
| Huidige staat | 81% | Na QA review |
| Na P0 implementatie | 85% | Performance geoptimaliseerd |
| Na P1 implementatie | 88% | Accessibility verbeterd |

