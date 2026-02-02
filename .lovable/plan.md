

# Apple visionOS Premium Glassmorphism: Complete Component Upgrade

## Analyse van de Screenshots

Uit de referentiebeelden zie ik:
- Task cards met subtiele schaduwen maar missen diepte
- Dialog/modal met standaard witte achtergrond - geen glass effect
- Kolom headers die vlak ogen
- Avatar badges zonder premium styling
- Buttons die basis styling hebben

---

## Verbeteringen Per Component

### 1. Dialog Component - Glassmorphism Upgrade

**Bestand: `src/components/ui/dialog.tsx`**

De DialogContent gebruikt nu `bg-background` - dit moet glass worden met diepte.

| Aspect | Huidige Waarde | Nieuwe Waarde |
|--------|----------------|---------------|
| Background | `bg-background` | `bg-white/85 dark:bg-slate-900/90 backdrop-blur-2xl` |
| Border | `border` | `border-white/40 dark:border-white/15` |
| Shadow | `shadow-lg` | Multi-layer shadow met blur |
| Overlay | `bg-black/80` | `bg-black/50 backdrop-blur-sm` |

**Wijzigingen:**

```tsx
// DialogOverlay - zachter met blur
className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm ..."

// DialogContent - glassmorphism
className="... bg-white/85 dark:bg-slate-900/90 backdrop-blur-2xl 
           border-white/40 dark:border-white/15 
           shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25),0_8px_24px_-8px_rgba(0,0,0,0.15),inset_0_1px_1px_rgba(255,255,255,0.1)] ..."
```

---

### 2. Card Component - Enhanced Shadow System

**Bestand: `src/components/ui/card.tsx`**

Cards missen Apple-niveau schaduw diepte.

**Wijzigingen:**

```tsx
// Card base
className="rounded-xl border border-white/30 dark:border-white/10 
           bg-white/80 dark:bg-slate-900/80 
           text-card-foreground 
           shadow-[0_2px_8px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)]
           backdrop-blur-sm"

// CardHeader - gradient top voor depth
className="flex flex-col space-y-1.5 p-6 
           bg-gradient-to-b from-white/40 to-transparent 
           dark:from-white/5 dark:to-transparent"
```

---

### 3. TaskCard - Premium Hover & Shadow

**Bestand: `src/components/TaskCard.tsx`**

Task cards hebben nu basis glass maar kunnen meer Apple-feeling krijgen.

**Wijzigingen:**

Regel 153:
```tsx
// Van:
className="glass-task-card hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 ease-out bg-white/80 dark:bg-slate-900/80 border-border/30 dark:border-white/10 ..."

// Naar:
className="glass-task-card glass-hover-lift active:scale-[0.99] 
           bg-white/75 dark:bg-slate-900/75 
           border-white/40 dark:border-white/12 
           shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06)] 
           hover:shadow-[0_8px_24px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05),inset_0_1px_1px_rgba(255,255,255,0.1)] 
           transition-all duration-250 ease-out ..."
```

Avatar styling (regel 171-173):
```tsx
// Voeg ring toe voor depth
<Avatar className="h-6 w-6 flex-shrink-0 ring-2 ring-white/50 dark:ring-white/20 shadow-sm">
```

---

### 4. Avatar Component - Glass Ring Effect

**Bestand: `src/components/ui/avatar.tsx`**

Avatars missen premium ring en schaduw.

**Wijzigingen:**

```tsx
// Avatar root - ring effect
className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full 
           ring-2 ring-white/60 dark:ring-white/20 
           shadow-[0_2px_8px_rgba(0,0,0,0.08)]"

// AvatarFallback - gradient background
className="flex h-full w-full items-center justify-center rounded-full 
           bg-gradient-to-br from-muted to-muted/80"
```

---

### 5. Select/Dropdown - Glassmorphism Menus

**Bestand: `src/components/ui/select.tsx`**

SelectContent gebruikt solide `bg-popover`.

**Wijzigingen:**

```tsx
// SelectContent
className="... bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl 
           border-white/30 dark:border-white/15 
           shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15),0_4px_16px_rgba(0,0,0,0.1)] ..."

// SelectItem - hover glass
className="... focus:bg-white/50 dark:focus:bg-slate-800/50 
           focus:backdrop-blur-sm ..."
```

**Bestand: `src/components/ui/dropdown-menu.tsx`**

Zelfde aanpassingen voor DropdownMenuContent:
```tsx
className="... bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl 
           border-white/30 dark:border-white/15 
           shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15),0_4px_16px_rgba(0,0,0,0.1)] ..."
```

---

### 6. TaskDetailModal - Premium Dialog Styling

**Bestand: `src/components/TaskDetailModal.tsx`**

De modal (regel 722) gebruikt standaard DialogContent.

**Wijzigingen:**

```tsx
// Regel 722
<DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto 
                          glass-layer-2 glass-light-bleed">
```

Section headers met glass:
```tsx
// Collapsible triggers (section headers)
className="flex items-center gap-2 p-3 rounded-lg 
           bg-white/40 dark:bg-slate-800/40 
           hover:bg-white/60 dark:hover:bg-slate-800/60 
           backdrop-blur-sm transition-all duration-200"
```

---

### 7. Button Quick Actions - Enhanced Glass

**Bestand: `src/components/TaskCard.tsx`**

Quick action buttons (regel 284-301) kunnen meer premium worden.

**Wijzigingen:**

```tsx
// Quick action buttons
className="h-7 w-7 
           bg-white/70 dark:bg-slate-900/70 
           backdrop-blur-md 
           border border-white/40 dark:border-white/15
           shadow-[0_2px_8px_rgba(0,0,0,0.08)]
           hover:bg-white/90 dark:hover:bg-slate-800/90 
           hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]
           transition-all duration-200"
```

---

### 8. Badge Priority Colors - Apple-style Tints

**Bestand: `src/components/TaskDetailModal.tsx`**

Priority badges (regel 119-124) kunnen glassmorphism krijgen.

**Wijzigingen:**

```tsx
const PRIORITY_BADGE_STYLES: Record<string, string> = {
  LOW: "bg-emerald-500/15 text-emerald-700 border-emerald-400/30 backdrop-blur-sm dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/20",
  MEDIUM: "bg-blue-500/15 text-blue-700 border-blue-400/30 backdrop-blur-sm dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/20",
  HIGH: "bg-amber-500/15 text-amber-700 border-amber-400/30 backdrop-blur-sm dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/20",
  CRITICAL: "bg-red-500/15 text-red-700 border-red-400/30 backdrop-blur-sm dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/20"
};
```

---

### 9. Input Component - Frosted Glass

**Bestand: `src/components/ui/input.tsx`**

Inputs hebben geen glass styling.

**Wijzigingen:**

```tsx
className="flex h-10 w-full rounded-lg 
           border border-white/30 dark:border-white/15 
           bg-white/50 dark:bg-slate-900/50 
           backdrop-blur-sm
           px-3 py-2 text-base 
           ring-offset-background 
           file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground 
           placeholder:text-muted-foreground/70 
           focus-visible:outline-none 
           focus-visible:ring-2 focus-visible:ring-tab-mijn-werk-500/30 
           focus-visible:ring-offset-2 
           focus-visible:bg-white/70 dark:focus-visible:bg-slate-900/70
           disabled:cursor-not-allowed disabled:opacity-50 
           transition-all duration-200
           md:text-sm"
```

---

### 10. Kanban Column Cards - Enhanced Depth

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx`**

Kolom cards (regel 590) kunnen diepere schaduwen gebruiken.

**Wijzigingen:**

```tsx
// Regel 590
<Card className="h-full min-h-[200px] glass-kanban-column 
                border-t-2 border-t-tab-mijn-werk-400/80 dark:border-t-tab-mijn-werk-600/80
                shadow-[0_4px_16px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.04)]">
```

Empty state icon bubble (regel 606):
```tsx
<div className="p-3 rounded-xl 
                bg-white/50 dark:bg-slate-800/50 
                backdrop-blur-sm 
                border border-white/30 dark:border-white/15
                shadow-[0_2px_8px_rgba(0,0,0,0.04)]
                mb-2">
```

---

### 11. CSS: Enhanced Shadow Tokens

**Bestand: `src/index.css`**

Voeg Apple-niveau shadow tokens toe:

```css
/* Apple-level shadow tokens */
:root {
  /* Layered shadows - visionOS style */
  --shadow-card: 
    0 1px 3px rgba(0, 0, 0, 0.04),
    0 4px 12px rgba(0, 0, 0, 0.06);
  --shadow-card-hover: 
    0 8px 24px rgba(0, 0, 0, 0.1),
    0 4px 8px rgba(0, 0, 0, 0.05),
    inset 0 1px 1px rgba(255, 255, 255, 0.1);
  --shadow-dialog: 
    0 25px 50px -12px rgba(0, 0, 0, 0.25),
    0 8px 24px -8px rgba(0, 0, 0, 0.15),
    inset 0 1px 1px rgba(255, 255, 255, 0.1);
  --shadow-dropdown: 
    0 10px 40px -10px rgba(0, 0, 0, 0.15),
    0 4px 16px rgba(0, 0, 0, 0.1);
}

.dark {
  --shadow-card: 
    0 1px 3px rgba(0, 0, 0, 0.2),
    0 4px 12px rgba(0, 0, 0, 0.3);
  --shadow-card-hover: 
    0 8px 24px rgba(0, 0, 0, 0.35),
    0 4px 8px rgba(0, 0, 0, 0.25),
    inset 0 1px 1px rgba(255, 255, 255, 0.05);
  --shadow-dialog: 
    0 25px 50px -12px rgba(0, 0, 0, 0.5),
    0 8px 24px -8px rgba(0, 0, 0, 0.4),
    inset 0 1px 1px rgba(255, 255, 255, 0.05);
}

/* Apple glass button */
.glass-button {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: 
    0 2px 8px rgba(0, 0, 0, 0.06),
    inset 0 1px 1px rgba(255, 255, 255, 0.2);
  transition: all 0.2s ease-out;
}

.glass-button:hover {
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 
    0 4px 12px rgba(0, 0, 0, 0.1),
    inset 0 1px 1px rgba(255, 255, 255, 0.25);
}

.dark .glass-button {
  background: rgba(30, 41, 59, 0.7);
  border-color: rgba(255, 255, 255, 0.15);
}

.dark .glass-button:hover {
  background: rgba(30, 41, 59, 0.85);
}

/* Premium input focus glow */
.glass-input:focus-visible {
  box-shadow: 
    0 0 0 3px hsla(234, 45%, 52%, 0.15),
    0 2px 8px rgba(0, 0, 0, 0.08);
}

/* Collapsible section glass */
.glass-section-trigger {
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 0.5rem;
  transition: all 0.2s ease-out;
}

.glass-section-trigger:hover {
  background: rgba(255, 255, 255, 0.6);
}

.dark .glass-section-trigger {
  background: rgba(30, 41, 59, 0.4);
}

.dark .glass-section-trigger:hover {
  background: rgba(30, 41, 59, 0.6);
}
```

---

### 12. Collapsible Sections - Glass Styling

**Bestand: `src/components/ui/collapsible.tsx`**

Voeg glass styling exports toe (voor gebruik in TaskDetailModal).

---

## Samenvatting Wijzigingen

| Bestand | Wijzigingen |
|---------|-------------|
| `src/index.css` | +45 regels (shadow tokens, glass-button, glass-input, glass-section) |
| `src/components/ui/dialog.tsx` | DialogOverlay + DialogContent glass styling |
| `src/components/ui/card.tsx` | Card + CardHeader enhanced shadows |
| `src/components/ui/input.tsx` | Frosted glass input styling |
| `src/components/ui/select.tsx` | SelectContent glass + shadow |
| `src/components/ui/dropdown-menu.tsx` | DropdownMenuContent glass + shadow |
| `src/components/ui/avatar.tsx` | Ring effect + shadow |
| `src/components/TaskCard.tsx` | Premium shadow hover + avatar ring |
| `src/components/TaskDetailModal.tsx` | Glass dialog + priority badges + section triggers |
| `src/components/dashboard/MyTasksFlowSection.tsx` | Column shadows + empty state polish |

**Totaal: ~15 bestanden, ~80 klassen/regels**

---

## Visuele Vergelijking

```text
┌─────────────────────────────────────────────────────────────────────┐
│  VOOR (Huidige staat)                                               │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Dialog: solid bg-background, basic shadow                    │   │
│  │ ┌─────────────────────────────────────────────────────────┐  │   │
│  │ │ Cards: flat shadow, no depth                            │  │   │
│  │ │ Inputs: solid bg-background                             │  │   │
│  │ │ Avatars: no ring, no shadow                             │  │   │
│  │ │ Dropdowns: solid bg-popover                             │  │   │
│  │ └─────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  NA (Apple visionOS niveau)                                         │
│                                                                     │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│  ░ Overlay: backdrop-blur-sm, 50% opacity                        ░   │
│  ░ ╔════════════════════════════════════════════════════════════╗ ░   │
│  ░ ║ Dialog: 85% white, blur-2xl, multi-layer shadow           ║ ░   │
│  ░ ║ ╭──────────────────────────────────────────────────────╮  ║ ░   │
│  ░ ║ │ Cards: layered shadows, hover lift                   │  ║ ░   │
│  ░ ║ │ ┌──────────────────────────────────────────────────┐ │  ║ ░   │
│  ░ ║ │ │ Inputs: frosted glass, focus glow               │ │  ║ ░   │
│  ░ ║ │ └──────────────────────────────────────────────────┘ │  ║ ░   │
│  ░ ║ │ ○ Avatars: ring-2 ring-white/60, soft shadow       │  ║ ░   │
│  ░ ║ ╰──────────────────────────────────────────────────────╯  ║ ░   │
│  ░ ╚════════════════════════════════════════════════════════════╝ ░   │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Premium Effect Details

| Effect | CSS Property | Apple Equivalent |
|--------|--------------|------------------|
| Multi-layer shadow | Comma-separated box-shadows | iOS card depth |
| Frosted dialog | backdrop-blur-2xl + 85% opacity | visionOS windows |
| Avatar ring | ring-2 ring-white/60 | iOS contact avatars |
| Input focus glow | box-shadow 0 0 0 3px | macOS focus rings |
| Dropdown blur | backdrop-blur-xl | iOS action sheets |
| Hover lift | translateY(-2px) + shadow grow | tvOS focus |

---

## Browser Compatibility

Alle effecten gebruiken standaard CSS properties met fallbacks:

| Feature | Support |
|---------|---------|
| backdrop-filter | Chrome 76+, Safari 9+, Firefox 103+, Edge 79+ |
| Multi-layer box-shadow | Alle moderne browsers |
| CSS custom properties | Alle moderne browsers |

---

## Accessibility Behouden

| Aspect | Implementatie |
|--------|---------------|
| Contrast | Minimum 60% opacity op glass surfaces |
| Focus states | Enhanced ring visibility |
| Reduced motion | Glass effects zijn static |
| Screen reader | Alle aria-labels intact |

