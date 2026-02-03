

# Responsive & Performance Optimalisatie - visionOS Glassmorphism

## Geïdentificeerde Problemen

Na analyse van de huidige implementatie heb ik de volgende aandachtspunten gevonden:

### 1. Performance Issues op Mobiel

| Probleem | Impact | Locatie |
|----------|--------|---------|
| `backdrop-filter: blur(20-24px)` | Hoge GPU-belasting op mobiel | Alle `.glass-card-*` classes |
| `inset: -150px` op ambient mesh | Overflowing pseudo-elements buiten viewport | Alle `.glass-ambient-mesh-*` classes |
| `filter: blur(50px)` op achtergrond | Extra compositing layer, batterijverbruik | Ambient mesh `::before` elements |
| Ontbrekende `overflow: hidden` op sommige pagina's | Horizontale scroll door -150px inset | Facturatie.tsx (heeft `p-6` maar geen clip) |

### 2. Ontbrekende Responsive Styling

| Pagina | Probleem |
|--------|----------|
| WhatsApp.tsx | Geen `glass-ambient-mesh-blue` toegepast |
| Alle pagina's | Geen mobiele blur-reductie voor performance |
| KPI Cards | Grid gaat naar 2 kolommen maar shadow-float kan te zwaar zijn |

---

## Oplossingen

### Fase 1: CSS Performance Optimalisaties (`src/index.css`)

**A. Mobiele Blur Reductie**

Voeg media queries toe om blur te verminderen op kleinere schermen:

```css
/* Mobile performance: reduce blur intensity */
@media (max-width: 768px) {
  .glass-layer-1,
  .glass-layer-2,
  .glass-card-emerald,
  .glass-card-indigo,
  .glass-card-rose,
  .glass-card-violet,
  .glass-card-slate,
  .glass-card-teal,
  .glass-card-amber {
    backdrop-filter: blur(12px) saturate(130%);
    -webkit-backdrop-filter: blur(12px) saturate(130%);
  }
}
```

**B. Ambient Mesh Verkleining op Mobiel**

```css
@media (max-width: 768px) {
  .glass-ambient-mesh::before,
  .glass-ambient-mesh-emerald::before,
  .glass-ambient-mesh-rose::before,
  .glass-ambient-mesh-violet::before,
  .glass-ambient-mesh-slate::before,
  .glass-ambient-mesh-teal::before,
  .glass-ambient-mesh-amber::before {
    /* Kleinere gradients voor mobiel */
    inset: -50px;
    filter: blur(30px);
  }
}
```

**C. Prefers-reduced-motion Ondersteuning**

```css
@media (prefers-reduced-motion: reduce) {
  .glass-layer-1,
  .glass-layer-2,
  .glass-card-emerald,
  /* ... alle glass cards ... */
  {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    transition: none;
  }
  
  .glass-ambient-mesh::before,
  /* ... alle ambient mesh ... */
  {
    display: none;
  }
}
```

**D. GPU Acceleration Hints**

```css
.glass-ambient-mesh::before,
.glass-ambient-mesh-emerald::before,
/* alle ambient mesh */
{
  will-change: auto;
  contain: strict;
}
```

### Fase 2: WhatsApp Pagina Blue Theme (`src/pages/WhatsApp.tsx`)

Voeg de blue glassmorphism toe aan de WhatsApp pagina:

```tsx
// Update wrapper div
<div className="flex h-[calc(100vh-4rem)] glass-ambient-mesh-blue">
```

En voeg de bijbehorende CSS toe:

```css
/* Blue ambient mesh for WhatsApp/Communicatie */
.glass-ambient-mesh-blue {
  position: relative;
  overflow: visible;
}

.glass-ambient-mesh-blue::before {
  content: '';
  position: absolute;
  inset: -150px;
  background: 
    radial-gradient(ellipse 700px 500px at 0% 0%, hsla(217, 91%, 65%, 0.12) 0%, transparent 50%),
    radial-gradient(ellipse 600px 400px at 100% 100%, hsla(217, 91%, 55%, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse 400px 300px at 50% 50%, hsla(217, 91%, 70%, 0.05) 0%, transparent 60%);
  pointer-events: none;
  z-index: -1;
  filter: blur(50px);
}

.dark .glass-ambient-mesh-blue::before {
  background: 
    radial-gradient(ellipse 700px 500px at 0% 0%, hsla(217, 91%, 25%, 0.10) 0%, transparent 50%),
    radial-gradient(ellipse 600px 400px at 100% 100%, hsla(217, 91%, 20%, 0.06) 0%, transparent 50%),
    radial-gradient(ellipse 400px 300px at 50% 50%, hsla(217, 91%, 30%, 0.04) 0%, transparent 60%);
}
```

### Fase 3: Container Overflow Fixes

**Facturatie.tsx:**
```tsx
// Van:
<div className="space-y-6 p-6 glass-ambient-mesh-emerald">

// Naar:
<div className="space-y-6 glass-ambient-mesh-emerald overflow-hidden">
```

**Alle pagina wrappers krijgen:**
```css
.glass-ambient-mesh-emerald,
.glass-ambient-mesh-rose,
.glass-ambient-mesh-violet,
.glass-ambient-mesh-slate,
.glass-ambient-mesh-teal,
.glass-ambient-mesh-amber,
.glass-ambient-mesh-blue {
  overflow: hidden; /* Voorkom horizontale scroll */
}
```

### Fase 4: KPI Card Responsive Shadows

Update `kpi-card.tsx` voor lichtere shadows op mobiel:

```tsx
// Voeg responsive shadow class toe
className={cn(
  // Bestaande classes...
  // Mobiel: lichtere shadows
  "shadow-sm md:shadow-float-emerald"
)}
```

---

## Technische Wijzigingen

### Bestanden die worden aangepast:

1. **`src/index.css`** (~80 regels toevoegen)
   - Media queries voor mobiele blur reductie
   - Media queries voor ambient mesh verkleining
   - `prefers-reduced-motion` support
   - `contain: strict` voor GPU optimalisatie
   - `.glass-ambient-mesh-blue` class voor WhatsApp
   - `overflow: hidden` op alle ambient mesh classes

2. **`src/pages/WhatsApp.tsx`**
   - Voeg `glass-ambient-mesh-blue` toe aan wrapper

3. **`src/pages/Facturatie.tsx`**
   - Verwijder inline padding, voeg `overflow-hidden` toe

4. **`src/components/ui/kpi-card.tsx`**
   - Responsive shadow classes

---

## Verwacht Resultaat

| Device | Verwachte Verbetering |
|--------|----------------------|
| iPhone/Android | 30-40% minder GPU-gebruik door blur reductie |
| iPad/Tablet | Stabiele 60fps door kleinere gradients |
| Desktop | Geen verandering - volledige effecten behouden |
| Toegankelijkheid | Volledige support voor motion-gevoelige gebruikers |

### Test Scenario's

1. **Mobiel (iPhone/Android)**: Scroll door pagina's, geen lag of jank
2. **Tablet (iPad)**: Glassmorphism zichtbaar maar performant
3. **Desktop**: Volledige visionOS effecten
4. **Reduced Motion**: Geen animaties, geen blur effecten
5. **Dark Mode**: Alle kleuren correct aangepast

