

# Gekleurde Schaduwen & Zwevend Effect - Apple visionOS Fase 4

## Concept: Indigo Colored Shadows

In Apple visionOS hebben schaduwen een subtiele tint van de omgevingskleur. Dit creëert het gevoel dat elementen echt losstaan van de achtergrond - een "zwevend" effect dat diepte suggereert.

---

## Technische Implementatie

### 1. CSS Shadow Tokens met Indigo Tint

**Bestand: `src/index.css`**

Voeg nieuwe Indigo-tinted shadow classes toe:

```css
/* ============================================
   COLORED SHADOWS - visionOS Floating Effect
   ============================================ */

/* Indigo-tinted shadows for Mijn Werk context */
.shadow-indigo-sm {
  box-shadow: 
    0 1px 2px hsla(234, 45%, 52%, 0.04),
    0 4px 8px hsla(234, 45%, 52%, 0.06);
}

.shadow-indigo-md {
  box-shadow: 
    0 4px 12px hsla(234, 45%, 52%, 0.08),
    0 8px 24px hsla(234, 45%, 52%, 0.12);
}

.shadow-indigo-lg {
  box-shadow: 
    0 8px 24px hsla(234, 45%, 52%, 0.12),
    0 16px 48px hsla(234, 45%, 52%, 0.16);
}

/* Hover state - intensere gekleurde schaduw */
.shadow-indigo-hover {
  box-shadow: 
    0 12px 32px hsla(234, 45%, 52%, 0.15),
    0 24px 64px hsla(234, 45%, 52%, 0.10),
    inset 0 1px 1px rgba(255, 255, 255, 0.15);
}

/* Card floating effect - combineert zwart + indigo */
.shadow-float-indigo {
  box-shadow: 
    0 4px 8px rgba(0, 0, 0, 0.04),
    0 8px 24px hsla(234, 45%, 52%, 0.10),
    0 16px 48px hsla(234, 45%, 52%, 0.08);
}

.shadow-float-indigo-hover {
  box-shadow: 
    0 8px 16px rgba(0, 0, 0, 0.05),
    0 16px 40px hsla(234, 45%, 52%, 0.14),
    0 32px 80px hsla(234, 45%, 52%, 0.10),
    inset 0 1px 2px rgba(255, 255, 255, 0.2);
}

/* Dark mode variants */
.dark .shadow-indigo-sm {
  box-shadow: 
    0 1px 2px hsla(234, 45%, 20%, 0.2),
    0 4px 8px hsla(234, 45%, 15%, 0.3);
}

.dark .shadow-indigo-md {
  box-shadow: 
    0 4px 12px hsla(234, 45%, 15%, 0.3),
    0 8px 24px hsla(234, 45%, 10%, 0.4);
}

.dark .shadow-indigo-lg {
  box-shadow: 
    0 8px 24px hsla(234, 45%, 15%, 0.35),
    0 16px 48px hsla(234, 45%, 10%, 0.45);
}

.dark .shadow-float-indigo {
  box-shadow: 
    0 4px 8px rgba(0, 0, 0, 0.2),
    0 8px 24px hsla(234, 45%, 15%, 0.25),
    0 16px 48px hsla(234, 45%, 10%, 0.2);
}

.dark .shadow-float-indigo-hover {
  box-shadow: 
    0 8px 16px rgba(0, 0, 0, 0.25),
    0 16px 40px hsla(234, 45%, 15%, 0.35),
    0 32px 80px hsla(234, 45%, 10%, 0.25),
    inset 0 1px 2px rgba(255, 255, 255, 0.1);
}
```

---

### 2. Glass Card Indigo - Enhanced Floating

**Bestand: `src/index.css`**

Update de bestaande `.glass-card-indigo` met gekleurde schaduwen:

```css
/* Indigo-tinted glass for Mijn Werk - ENHANCED */
.glass-card-indigo {
  position: relative;
  overflow: hidden;
  border-radius: 0.75rem;
  background: linear-gradient(
    135deg,
    hsla(234, 45%, 97%, 0.75) 0%,
    hsla(234, 45%, 97%, 0.45) 100%
  );
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid hsla(234, 45%, 88%, 0.5);
  /* GEKLEURDE SCHADUW - zwevend effect */
  box-shadow:
    0 4px 12px hsla(234, 45%, 52%, 0.08),
    0 8px 32px hsla(234, 45%, 52%, 0.12),
    inset 0 1px 1px hsla(234, 45%, 97%, 0.4);
}

.glass-card-indigo:hover {
  box-shadow:
    0 8px 24px hsla(234, 45%, 52%, 0.12),
    0 16px 48px hsla(234, 45%, 52%, 0.16),
    inset 0 1px 2px hsla(234, 45%, 97%, 0.5);
  transform: translateY(-2px);
}

.dark .glass-card-indigo {
  background: linear-gradient(
    135deg,
    hsla(234, 45%, 26%, 0.55) 0%,
    hsla(234, 45%, 20%, 0.35) 100%
  );
  border-color: hsla(234, 45%, 40%, 0.35);
  box-shadow:
    0 4px 12px hsla(234, 45%, 15%, 0.25),
    0 8px 32px hsla(234, 45%, 10%, 0.35),
    inset 0 1px 1px hsla(234, 45%, 52%, 0.15);
}

.dark .glass-card-indigo:hover {
  box-shadow:
    0 8px 24px hsla(234, 45%, 15%, 0.35),
    0 16px 48px hsla(234, 45%, 10%, 0.45),
    inset 0 1px 2px hsla(234, 45%, 52%, 0.2);
}
```

---

### 3. Main Container - Floating Effect

**Bestand: `src/pages/UnifiedDashboard.tsx`**

Update de glass-layer-1 container:

```tsx
// Regel 272 - Voeg shadow-float-indigo toe
<div className="glass-layer-1 glass-light-bleed shadow-float-indigo p-6 rounded-2xl space-y-6">
```

---

### 4. TaskCard - Indigo Floating Shadows

**Bestand: `src/components/TaskCard.tsx`**

Update regel 153 met gekleurde schaduwen:

```tsx
<Card className="glass-task-card glass-hover-lift active:scale-[0.99] 
                bg-white/75 dark:bg-slate-900/75 
                border-white/40 dark:border-white/12 
                shadow-[0_2px_6px_hsla(234,45%,52%,0.06),0_8px_24px_hsla(234,45%,52%,0.10)] 
                hover:shadow-[0_12px_32px_hsla(234,45%,52%,0.14),0_24px_64px_hsla(234,45%,52%,0.08),inset_0_1px_1px_rgba(255,255,255,0.15)] 
                transition-all duration-250 ease-out 
                focus:outline-none focus:ring-2 focus:ring-tab-mijn-werk-500/30 focus:ring-offset-2 
                relative rounded-xl">
```

---

### 5. Kanban Columns - Floating Effect

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx`**

Update regel 590:

```tsx
<Card className="h-full min-h-[200px] glass-kanban-column 
                border-t-2 border-t-tab-mijn-werk-400/80 dark:border-t-tab-mijn-werk-600/80
                shadow-[0_4px_12px_hsla(234,45%,52%,0.08),0_12px_32px_hsla(234,45%,52%,0.06)]">
```

---

### 6. TodayFocusCard - Premium Floating

**Bestand: `src/components/dashboard/TodayFocusCard.tsx`**

De `glass-card-indigo` class krijgt automatisch de nieuwe schaduwen via CSS.
Voeg extra hover transition toe:

```tsx
// Regel 85 en 105
<Card className="glass-card-indigo glass-light-bleed-indigo glass-hover-lift transition-all duration-300">
```

---

### 7. UpcomingRemindersWidget - Colored Shadow

**Bestand: `src/components/UpcomingRemindersWidget.tsx`**

Update regel 80:

```tsx
<Card className="glass-layer-2 glass-light-bleed glass-hover-lift 
                border-tab-mijn-werk-200/30 dark:border-tab-mijn-werk-800/30
                shadow-[0_4px_12px_hsla(234,45%,52%,0.08),0_8px_24px_hsla(234,45%,52%,0.06)]
                hover:shadow-[0_8px_24px_hsla(234,45%,52%,0.12),0_16px_48px_hsla(234,45%,52%,0.08)]
                transition-all duration-300">
```

---

### 8. Glass Layer 1 - Ambient Indigo Glow

**Bestand: `src/index.css`**

Voeg een subtiele ambient glow toe onder de glass-layer-1:

```css
/* Glass layer 1 with floating effect */
.glass-layer-1 {
  position: relative;
  overflow: hidden;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.60);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.25);
  /* FLOATING INDIGO SHADOW */
  box-shadow:
    0 4px 16px hsla(234, 45%, 52%, 0.06),
    0 12px 40px hsla(234, 45%, 52%, 0.08),
    inset 0 1px 1px rgba(255, 255, 255, 0.1);
}

.dark .glass-layer-1 {
  background: rgba(15, 23, 42, 0.60);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow:
    0 4px 16px hsla(234, 45%, 15%, 0.2),
    0 12px 40px hsla(234, 45%, 10%, 0.25),
    inset 0 1px 1px rgba(255, 255, 255, 0.05);
}
```

---

### 9. Quick Action Buttons - Subtle Indigo

**Bestand: `src/components/TaskCard.tsx`**

Update regel 287 en 296:

```tsx
className="h-7 w-7 
           bg-white/70 dark:bg-slate-900/70 
           backdrop-blur-md 
           border border-white/40 dark:border-white/15
           shadow-[0_2px_8px_hsla(234,45%,52%,0.10)]
           hover:bg-white/90 dark:hover:bg-slate-800/90 
           hover:shadow-[0_4px_12px_hsla(234,45%,52%,0.15)]
           transition-all duration-200"
```

---

### 10. Ambient Background Glow Enhancement

**Bestand: `src/index.css`**

Versterk de ambient mesh met meer Indigo:

```css
/* Ambient gradient mesh - ENHANCED visionOS style */
.glass-ambient-mesh::before {
  content: '';
  position: absolute;
  inset: -150px;
  background: 
    radial-gradient(ellipse 700px 500px at 0% 0%, hsla(234, 45%, 75%, 0.18) 0%, transparent 50%),
    radial-gradient(ellipse 600px 400px at 100% 100%, hsla(234, 45%, 65%, 0.12) 0%, transparent 50%),
    radial-gradient(ellipse 400px 300px at 50% 50%, hsla(234, 45%, 80%, 0.08) 0%, transparent 60%);
  pointer-events: none;
  z-index: -1;
  filter: blur(50px);
}
```

---

## Visuele Vergelijking

```text
┌─────────────────────────────────────────────────────────────────────┐
│  VOOR: Grijze/zwarte schaduwen                                      │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │   │
│  │ ░  Card met rgba(0,0,0,0.1) shadow                        ░ │   │
│  │ ░  Voelt "plat" - schaduw matcht niet met context         ░ │   │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  NA: Indigo gekleurde schaduwen                                     │
│                                                                     │
│  ╔══════════════════════════════════════════════════════════════╗   │
│  ║                                                              ║   │
│  ║   ┌────────────────────────────────────────────────────┐     ║   │
│  ║   │                                                    │     ║   │
│  ║   │   Card met hsla(234,45%,52%,0.12) shadow          │     ║   │
│  ║   │   ZWEEFT boven de achtergrond                     │     ║   │
│  ║   │   Schaduw heeft Indigo tint                       │     ║   │
│  ║   │                                                    │     ║   │
│  ║   └────────────────────────────────────────────────────┘     ║   │
│  ║       ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓           ║   │
│  ║       ▓ INDIGO GEKLEURDE SCHADUW - DIEPTE           ▓       ║   │
│  ║       ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓           ║   │
│  ║                                                              ║   │
│  ╚══════════════════════════════════════════════════════════════╝   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Samenvatting Wijzigingen

| Bestand | Wijzigingen |
|---------|-------------|
| `src/index.css` | +50 regels (shadow-indigo-*, glass-card-indigo update, glass-layer-1 update, ambient mesh) |
| `src/components/TaskCard.tsx` | Regel 153: Indigo shadow, Regel 287/296: button shadows |
| `src/components/dashboard/MyTasksFlowSection.tsx` | Regel 590: Kolom Indigo shadow |
| `src/components/dashboard/TodayFocusCard.tsx` | Regel 85, 105: transition class |
| `src/components/UpcomingRemindersWidget.tsx` | Regel 80: Indigo shadow + hover |
| `src/pages/UnifiedDashboard.tsx` | Regel 272: shadow-float-indigo class |

**Totaal: ~60 regels CSS + 6 component updates**

---

## Apple visionOS Reference

| Effect | Implementatie | Apple Equivalent |
|--------|--------------|------------------|
| Colored shadow | `hsla(234, 45%, 52%, 0.12)` | visionOS app icons |
| Multi-layer depth | 3 shadow layers | visionOS window depth |
| Hover lift | `translateY(-2px)` + shadow grow | tvOS focus states |
| Ambient glow | Radial gradient mesh | visionOS environmental lighting |
| Inner rim light | `inset 0 1px` | visionOS frosted glass |

---

## Schaduw Kleur Theorie

Waarom Indigo-tinted shadows werken:

1. **Harmonie**: Schaduw neemt kleur over van de tab context
2. **Diepte**: Gekleurde schaduwen suggereren afstand tot oppervlak
3. **Premium feel**: Apple visionOS, iOS 17+ gebruiken dit patroon
4. **Consistentie**: Alle elementen in "Mijn Werk" delen dezelfde kleur DNA

---

## Browser Compatibility

| Feature | Chrome | Safari | Firefox | Edge |
|---------|--------|--------|---------|------|
| HSLA shadows | All | All | All | All |
| Multi-layer shadow | All | All | All | All |
| backdrop-filter | 76+ | 9+ | 103+ | 79+ |

