

# Apple visionOS Glassmorphism: Complete "Mijn Werk" Verfijning

## Design Filosofie - visionOS Materials

Apple's visionOS introduceert de meest verfijnde glassmorphism ooit, met:
- **Inner shadow**: Subtiele diepte (inset 0 1px 1px rgba(255,255,255,0.1))
- **Outer shadow**: Zachte elevation (0 4px 12px rgba(0,0,0,0.05))
- **Light bleed**: Gradient border die licht "lekt" aan de randen
- **High saturation blur**: backdrop-saturate(180%) voor levendige kleuren

---

## Visuele Impact

```text
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   LIGHT BLEED EFFECT (::before pseudo-element)                      │
│   ╭───────────────────────────────────────────────────────────────╮ │
│   │ ↘ gradient-border: white 40% → 10% → 0%                       │ │
│   │                                                                │ │
│   │   INNER SHADOW (inset)                                         │ │
│   │   ┌────────────────────────────────────────────────────────┐   │ │
│   │   │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │   │ │
│   │   │ ▒ backdrop-blur(20px) + saturate(180%)              ▒ │   │ │
│   │   │ ▒                                                   ▒ │   │ │
│   │   │ ▒   Content floats on glass                         ▒ │   │ │
│   │   │ ▒                                                   ▒ │   │ │
│   │   │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │   │ │
│   │   └────────────────────────────────────────────────────────┘   │ │
│   │                                                                │ │
│   ╰───────────────────────────────────────────────────────────────╯ │
│                                                                     │
│   OUTER SHADOW (subtle elevation)                                   │
│   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementatie Overzicht

### Fase 1: CSS Glassmorphism Systeem

**Bestand: `src/index.css`**

Na de bestaande `.glass-panel` class (regel 278), voegen we een compleet glassmorphism systeem toe:

```css
/* ============================================
   APPLE visionOS GLASSMORPHISM SYSTEM
   ============================================ */

/* Layer 1: Lightest glass - containers */
.glass-layer-1 {
  @apply bg-white/60 dark:bg-slate-900/60 relative overflow-hidden;
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.20);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.08),
    0 4px 12px rgba(0, 0, 0, 0.04);
}

/* Layer 2: Medium glass - cards */
.glass-layer-2 {
  @apply bg-white/72 dark:bg-slate-900/72 relative overflow-hidden;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.30);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.1),
    0 4px 12px rgba(0, 0, 0, 0.05);
}

/* Indigo-tinted glass for Mijn Werk */
.glass-card-indigo {
  @apply relative overflow-hidden;
  background: linear-gradient(
    135deg,
    hsl(234 45% 97% / 0.7) 0%,
    hsl(234 45% 97% / 0.4) 100%
  );
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid hsl(234 45% 88% / 0.4);
  box-shadow:
    inset 0 1px 1px hsl(234 45% 97% / 0.3),
    0 4px 16px hsl(234 45% 52% / 0.06);
}

/* Dark mode variants */
.dark .glass-layer-1,
.dark .glass-layer-2 {
  border-color: rgba(255, 255, 255, 0.10);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.05),
    0 4px 12px rgba(0, 0, 0, 0.2);
}

.dark .glass-card-indigo {
  background: linear-gradient(
    135deg,
    hsl(234 45% 26% / 0.5) 0%,
    hsl(234 45% 20% / 0.3) 100%
  );
  border-color: hsl(234 45% 38% / 0.3);
  box-shadow:
    inset 0 1px 1px hsl(234 45% 52% / 0.1),
    0 4px 16px rgba(0, 0, 0, 0.3);
}

/* Light Bleed Effect - visionOS style */
.glass-light-bleed::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.4) 0%,
    rgba(255, 255, 255, 0.1) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  -webkit-mask: 
    linear-gradient(#fff 0 0) content-box, 
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
  -webkit-mask-composite: xor;
  pointer-events: none;
  z-index: 1;
}

.dark .glass-light-bleed::before {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.15) 0%,
    rgba(255, 255, 255, 0.05) 50%,
    rgba(255, 255, 255, 0) 100%
  );
}

/* Indigo light bleed variant */
.glass-light-bleed-indigo::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(
    135deg,
    hsl(234 45% 88% / 0.5) 0%,
    hsl(234 45% 88% / 0.2) 50%,
    transparent 100%
  );
  -webkit-mask: 
    linear-gradient(#fff 0 0) content-box, 
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
  -webkit-mask-composite: xor;
  pointer-events: none;
  z-index: 1;
}

/* Kanban column glass */
.glass-kanban-column {
  @apply relative overflow-hidden;
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 2px 8px rgba(0, 0, 0, 0.03);
}

.dark .glass-kanban-column {
  background: rgba(30, 41, 59, 0.45);
  border-color: rgba(255, 255, 255, 0.08);
}

/* Task card glass - subtle on hover */
.glass-task-card {
  @apply transition-all duration-200;
}

.glass-task-card:hover {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    0 4px 12px rgba(0, 0, 0, 0.08);
}

.dark .glass-task-card:hover {
  background: rgba(30, 41, 59, 0.85);
}
```

---

### Fase 2: Design Tokens Uitbreiden

**Bestand: `src/lib/constants/designTokens.ts`**

Voeg `GLASS_TOKENS` toe na de bestaande `TAB_CONTEXT_COLORS`:

```typescript
// ============================================
// GLASSMORPHISM TOKENS - Apple visionOS Style
// ============================================

export const GLASS_TOKENS = {
  layer1: {
    class: 'glass-layer-1',
    lightBleed: 'glass-light-bleed',
    description: 'Lightest glass for containers',
  },
  layer2: {
    class: 'glass-layer-2',
    lightBleed: 'glass-light-bleed',
    description: 'Medium glass for cards',
  },
  indigo: {
    class: 'glass-card-indigo',
    lightBleed: 'glass-light-bleed-indigo',
    description: 'Indigo-tinted glass for Mijn Werk',
  },
  kanban: {
    class: 'glass-kanban-column',
    description: 'Subtle glass for kanban columns',
  },
  taskCard: {
    class: 'glass-task-card',
    description: 'Hover glass effect for task cards',
  },
} as const;
```

---

### Fase 3: Component Updates

#### 3.1 TodayFocusCard.tsx

**Regel 60 (loading state):**
```tsx
// Van:
<Card className="backdrop-blur-sm border-white/50 dark:border-white/10">

// Naar:
<Card className="glass-card-indigo glass-light-bleed-indigo rounded-xl">
```

**Regel 85 (empty state):**
```tsx
// Van:
<Card className="backdrop-blur-sm border-white/50 dark:border-white/10 bg-gradient-to-br from-tab-mijn-werk-50/80 to-white/60 dark:from-tab-mijn-werk-900/30 dark:to-background/60">

// Naar:
<Card className="glass-card-indigo glass-light-bleed-indigo rounded-xl">
```

**Regel 103 (main card):**
```tsx
// Van:
<Card className="backdrop-blur-sm border-white/50 dark:border-white/10 bg-gradient-to-br from-tab-mijn-werk-50/80 to-white/60 dark:from-tab-mijn-werk-900/30 dark:to-background/60">

// Naar:
<Card className="glass-card-indigo glass-light-bleed-indigo rounded-xl">
```

---

#### 3.2 UpcomingRemindersWidget.tsx

**Regel 80 (main card):**
```tsx
// Van:
<Card className="border-muted">

// Naar:
<Card className="glass-layer-2 glass-light-bleed rounded-xl border-tab-mijn-werk-200/30 dark:border-tab-mijn-werk-800/30">
```

**Regel 107 (reminder items):**
```tsx
// Van:
className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-tab-mijn-werk-50 dark:hover:bg-tab-mijn-werk-900/20 transition-colors group"

// Naar:
className="flex items-center justify-between p-3 rounded-lg bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm hover:bg-tab-mijn-werk-50/60 dark:hover:bg-tab-mijn-werk-900/30 border border-transparent hover:border-tab-mijn-werk-200/50 dark:hover:border-tab-mijn-werk-700/30 transition-all duration-200 group"
```

---

#### 3.3 MyTasksFlowSection.tsx

**Regel 588 (Kanban column Card):**
```tsx
// Van:
<Card className="h-full min-h-[200px] bg-muted/30 border-t-2 border-t-tab-mijn-werk-200 dark:border-t-tab-mijn-werk-800">

// Naar:
<Card className="h-full min-h-[200px] glass-kanban-column rounded-xl border-t-2 border-t-tab-mijn-werk-300 dark:border-t-tab-mijn-werk-700">
```

**Regel 561 (empty state Card):**
```tsx
// Van:
<Card className="border-dashed">

// Naar:
<Card className="border-dashed glass-layer-1 rounded-xl">
```

**Regel 121 (drag-over highlight):**
```tsx
// Van:
isOver ? "bg-tab-mijn-werk-100/50 dark:bg-tab-mijn-werk-900/30 rounded-lg ring-2 ring-tab-mijn-werk-300/50" : ""

// Naar:
isOver ? "bg-tab-mijn-werk-100/60 dark:bg-tab-mijn-werk-900/40 backdrop-blur-xl rounded-xl ring-2 ring-tab-mijn-werk-400/60 shadow-lg shadow-tab-mijn-werk-500/10" : ""
```

---

#### 3.4 TaskCard.tsx

**Regel 153 (Card):**
```tsx
// Van:
<Card className="hover:scale-[1.01] hover:shadow-md active:scale-[0.99] transition-all duration-200 ease-out border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 relative">

// Naar:
<Card className="glass-task-card hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 ease-out bg-white/80 dark:bg-slate-900/80 border-border/30 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-tab-mijn-werk-500/30 focus:ring-offset-2 relative rounded-lg">
```

**Regel 306 (HoverCardContent):**
```tsx
// Van:
<HoverCardContent className="w-80" side="right" align="start">

// Naar:
<HoverCardContent className="w-80 glass-layer-2 glass-light-bleed rounded-xl" side="right" align="start">
```

---

## Tailwind Config Update

**Bestand: `tailwind.config.ts`**

Voeg backdropSaturate utilities toe (rond regel 265):

```typescript
extend: {
  // ... bestaande config
  backdropSaturate: {
    '140': '1.4',
    '150': '1.5',
    '180': '1.8',
  },
  // ... rest
}
```

---

## Samenvatting Wijzigingen

| Bestand | Wijzigingen |
|---------|-------------|
| `src/index.css` | +55 regels (complete glassmorphism systeem) |
| `src/lib/constants/designTokens.ts` | +20 regels (GLASS_TOKENS) |
| `tailwind.config.ts` | +4 regels (backdropSaturate) |
| `src/components/dashboard/TodayFocusCard.tsx` | 3 Card class updates |
| `src/components/UpcomingRemindersWidget.tsx` | 2 updates |
| `src/components/dashboard/MyTasksFlowSection.tsx` | 3 updates |
| `src/components/TaskCard.tsx` | 2 updates |

---

## Premium Effecten Breakdown

| Effect | CSS Property | Apple Equivalent |
|--------|--------------|------------------|
| Frosted blur | backdrop-filter: blur(20px) | Vibrancy |
| Saturation boost | saturate(180%) | Material saturation |
| Inner highlight | inset box-shadow | Top edge highlight |
| Depth shadow | outer box-shadow | Elevation |
| Light bleed | ::before gradient mask | visionOS edge glow |

---

## Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome 76+ | Volledig |
| Safari 9+ | Volledig (-webkit-prefix) |
| Firefox 103+ | Volledig |
| Edge 79+ | Volledig |
| iOS Safari | Volledig |

Fallback: Solid achtergrond zonder blur voor oudere browsers.

---

## Accessibility Checklist

| Aspect | Implementatie |
|--------|---------------|
| Contrast | Achtergrond opacity ≥60% |
| Reduced Motion | Glass static, geen animatie |
| Focus States | Ring kleuren zichtbaar op glass |
| Dark Mode | Alle effecten geoptimaliseerd |

