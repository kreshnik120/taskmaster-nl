

# Fase 12: Cross-Page Glassmorphism Consistency & Final Polish

## Overzicht van Huidige Status

Na grondige analyse van alle pagina's en componenten identificeer ik de volgende verbeterpunten waar de premium visionOS glassmorphism nog niet is toegepast:

## Prioriteit 1: Cards met Transform-based Hover (DnD-incompatibel)

| Component | Huidige Klasse | Probleem |
|-----------|----------------|----------|
| `ClientCard.tsx` | `hover:-translate-y-0.5` | Transform op hover veroorzaakt DnD issues |
| `OrganizationCardSimple.tsx` | `hover:-translate-y-0.5` | Zelfde probleem |
| `ProfessionalCard.tsx` | `hover:shadow-sm` | Lichte shadow, geen glass styling |
| `OrganizationCard.tsx` | `hover:shadow-lg` | Geen glass behandeling |
| `Plaatsingen.tsx` (Card) | `hover:shadow-md` | Basisstijl, geen glass |

## Prioriteit 2: KPICard Glassmorphism Upgrade

De `KPICard` component gebruikt gradients maar mist:
- Context-gekleurde shadows
- Glass backdrop-blur
- Light bleed effects

## Prioriteit 3: HoverCard Content Styling

Diverse `HoverCardContent` componenten missen `glass-layer-2` en `glass-light-bleed`:
- `ClientCard.tsx`
- `OrganizationCardSimple.tsx`
- `ProfessionalCard.tsx`

## Prioriteit 4: Quick Action Buttons Upgrade

De action buttons in footers van cards (Phone, Mail, MapPin) in:
- `ClientCard.tsx`
- `OrganizationCardSimple.tsx`
- `ProfessionalCard.tsx`

Gebruiken `hover:scale-105` wat transforms zijn — vervangen door shadow-based hover.

---

## Wijzigingsplan

### 1. ClientCard.tsx

**Regel 165-168:** Verwijder transform-based hover

```tsx
// VOOR
className={`cursor-pointer transition-all duration-200 hover:bg-muted/30 hover:shadow-md hover:-translate-y-0.5 ${cardOpacity} flex flex-col overflow-hidden`}

// NA - Glass styling (Slate theme voor Klanten)
className={`cursor-pointer glass-hover-lift bg-white/75 dark:bg-slate-900/75 border-white/40 dark:border-white/12 shadow-[0_2px_6px_hsla(215,25%,48%,0.06),0_8px_24px_hsla(215,25%,48%,0.10)] focus:outline-none focus:ring-2 focus:ring-slate-500/30 focus:ring-offset-2 relative rounded-xl ${cardOpacity} flex flex-col overflow-hidden`}
```

**Regel 325:** HoverCardContent glass styling

```tsx
// VOOR
<HoverCardContent className="w-80" side="top">

// NA
<HoverCardContent className="w-80 glass-layer-2 glass-light-bleed rounded-xl" side="top">
```

**Regels 267-319:** Quick action buttons upgrade naar glass (verwijder `hover:scale-105`)

```tsx
// VOOR (elke button)
className="h-7 px-2 disabled:opacity-40 hover:scale-105 hover:bg-primary/10 transition-all duration-200"

// NA - Glass buttons met slate-tinted shadows
className="h-7 px-2 disabled:opacity-40 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_6px_hsla(215,25%,48%,0.08)] hover:bg-white/80 dark:hover:bg-slate-800/80 hover:shadow-[0_4px_10px_hsla(215,25%,48%,0.12)] transition-all duration-200"
```

### 2. OrganizationCardSimple.tsx

**Regel 177-179:** Verwijder transform-based hover

```tsx
// VOOR
className={`cursor-pointer transition-all duration-200 hover:bg-muted/30 hover:shadow-md hover:-translate-y-0.5 ${isIncomplete ? 'opacity-80' : 'opacity-100'} flex flex-col overflow-hidden`}

// NA - Glass styling (Slate theme)
className={`cursor-pointer glass-hover-lift bg-white/75 dark:bg-slate-900/75 border-white/40 dark:border-white/12 shadow-[0_2px_6px_hsla(215,25%,48%,0.06),0_8px_24px_hsla(215,25%,48%,0.10)] focus:outline-none focus:ring-2 focus:ring-slate-500/30 rounded-xl ${isIncomplete ? 'opacity-80' : 'opacity-100'} flex flex-col overflow-hidden`}
```

**Regel 329:** HoverCardContent glass styling

```tsx
// NA
<HoverCardContent className="w-80 glass-layer-2 glass-light-bleed rounded-xl" side="top">
```

**Regels 270-323:** Quick action buttons upgrade (zelfde als ClientCard)

### 3. ProfessionalCard.tsx

**Regel 112-118:** Glass styling toevoegen

```tsx
// VOOR
className={cn(
  "cursor-pointer border-border bg-background overflow-hidden",
  "transition-shadow duration-150",
  "hover:shadow-sm"
)}

// NA - Glass styling (Violet theme voor Professionals/Team)
className={cn(
  "cursor-pointer glass-hover-lift bg-white/75 dark:bg-slate-900/75 border-white/40 dark:border-white/12",
  "shadow-[0_2px_6px_hsla(270,45%,55%,0.06),0_8px_24px_hsla(270,45%,55%,0.10)]",
  "focus:outline-none focus:ring-2 focus:ring-violet-500/30 rounded-xl overflow-hidden"
)}
```

**Regel 284:** HoverCardContent glass styling

```tsx
// NA
<HoverCardContent className="w-80 glass-layer-2 glass-light-bleed rounded-xl">
```

**Regels 217-265:** Quick action footer buttons upgrade

```tsx
// VOOR (buttons in footer)
className="h-8 text-xs px-2"

// NA - Glass buttons met violet-tinted shadows
className="h-8 text-xs px-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_6px_hsla(270,45%,55%,0.08)] hover:bg-white/80 dark:hover:bg-slate-800/80 hover:shadow-[0_4px_10px_hsla(270,45%,55%,0.12)] transition-all duration-200"
```

### 4. OrganizationCard.tsx

**Regel 100-101:** Glass styling toevoegen

```tsx
// VOOR
className="p-4 hover:shadow-lg hover:bg-accent/5 transition-all duration-200 cursor-pointer border-l-4 border-l-primary/60"

// NA
className="p-4 glass-hover-lift bg-white/75 dark:bg-slate-900/75 border-white/40 dark:border-white/12 border-l-4 border-l-primary/60 shadow-[0_2px_6px_hsla(215,25%,48%,0.06),0_8px_24px_hsla(215,25%,48%,0.10)] rounded-xl cursor-pointer"
```

### 5. Plaatsingen.tsx — Placement Cards

**Regel 290:** Glass styling voor placement cards

```tsx
// VOOR
className="hover:shadow-md transition-all duration-200 cursor-pointer border-border/50"

// NA - Glass styling (Emerald theme voor Plaatsingen/Success)
className="glass-hover-lift bg-white/75 dark:bg-slate-900/75 border-white/40 dark:border-white/12 shadow-[0_2px_6px_hsla(142,71%,45%,0.06),0_8px_24px_hsla(142,71%,45%,0.10)] rounded-xl cursor-pointer"
```

### 6. KPICard Upgrade

**Bestand: `src/components/ui/kpi-card.tsx`**

Voeg glass behandeling toe aan de Card wrapper:

```tsx
// NA - Voeg glass backdrop toe
<Card
  className={cn(
    "relative overflow-hidden transition-all duration-200",
    isMinimal 
      ? "border-0 bg-background shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
      : cn(
          // NIEUW: Glass backdrop
          "bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm",
          "border border-white/50 dark:border-white/10",
          config.borderColor,
          "border-t-4",
          config.shadowColor
        ),
    onClick && "cursor-pointer hover:translate-y-[-1px]",
    isActive && `ring-2 ring-offset-2 ${config.ringColor}`,
    className
  )}
  onClick={onClick}
>
```

### 7. CSS: Context-Colored Glass Card Classes

**Bestand: `src/index.css`**

Voeg toe aan het einde van de file:

```css
/* ============================================
   PHASE 12: CONTEXT-COLORED GLASS CARDS
   ============================================ */

/* Slate-tinted glass for Klanten */
.glass-card-slate {
  position: relative;
  overflow: hidden;
  border-radius: 0.75rem;
  background: linear-gradient(135deg, hsla(215, 25%, 97%, 0.75) 0%, hsla(215, 25%, 97%, 0.45) 100%);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid hsla(215, 25%, 88%, 0.5);
  box-shadow: 0 4px 12px hsla(215, 25%, 48%, 0.08), 0 8px 32px hsla(215, 25%, 48%, 0.12);
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.dark .glass-card-slate {
  background: linear-gradient(135deg, hsla(215, 25%, 26%, 0.55) 0%, hsla(215, 25%, 20%, 0.35) 100%);
  border-color: hsla(215, 25%, 40%, 0.35);
  box-shadow: 0 4px 12px hsla(215, 25%, 15%, 0.25), 0 8px 32px hsla(215, 25%, 10%, 0.35);
}

/* Emerald-tinted glass for Plaatsingen */
.glass-card-emerald {
  position: relative;
  overflow: hidden;
  border-radius: 0.75rem;
  background: linear-gradient(135deg, hsla(142, 71%, 97%, 0.75) 0%, hsla(142, 71%, 97%, 0.45) 100%);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid hsla(142, 71%, 85%, 0.5);
  box-shadow: 0 4px 12px hsla(142, 71%, 45%, 0.08), 0 8px 32px hsla(142, 71%, 45%, 0.12);
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.dark .glass-card-emerald {
  background: linear-gradient(135deg, hsla(142, 71%, 20%, 0.55) 0%, hsla(142, 71%, 15%, 0.35) 100%);
  border-color: hsla(142, 71%, 35%, 0.35);
  box-shadow: 0 4px 12px hsla(142, 71%, 15%, 0.25), 0 8px 32px hsla(142, 71%, 10%, 0.35);
}

/* Emerald drag overlay for Plaatsingen context */
.glass-drag-overlay-emerald {
  position: relative;
  border-radius: 0.75rem;
  box-shadow:
    0 25px 60px -15px hsla(142, 71%, 45%, 0.25),
    0 15px 35px -10px hsla(142, 71%, 45%, 0.18),
    0 5px 15px -5px hsla(142, 71%, 45%, 0.12),
    inset 0 1px 2px rgba(255, 255, 255, 0.25),
    0 0 0 1px hsla(142, 71%, 45%, 0.08);
  transition: none !important;
  will-change: transform;
  transform: none !important;
}

.dark .glass-drag-overlay-emerald {
  box-shadow:
    0 25px 60px -15px hsla(142, 71%, 15%, 0.50),
    0 15px 35px -10px hsla(142, 71%, 15%, 0.35),
    0 5px 15px -5px hsla(142, 71%, 15%, 0.25),
    inset 0 1px 2px rgba(255, 255, 255, 0.10),
    0 0 0 1px hsla(142, 71%, 45%, 0.15);
}

/* Slate drag overlay for Klanten context */
.glass-drag-overlay-slate {
  position: relative;
  border-radius: 0.75rem;
  box-shadow:
    0 25px 60px -15px hsla(215, 25%, 48%, 0.25),
    0 15px 35px -10px hsla(215, 25%, 48%, 0.18),
    0 5px 15px -5px hsla(215, 25%, 48%, 0.12),
    inset 0 1px 2px rgba(255, 255, 255, 0.25),
    0 0 0 1px hsla(215, 25%, 48%, 0.08);
  transition: none !important;
  will-change: transform;
  transform: none !important;
}

.dark .glass-drag-overlay-slate {
  box-shadow:
    0 25px 60px -15px hsla(215, 25%, 15%, 0.50),
    0 15px 35px -10px hsla(215, 25%, 15%, 0.35),
    0 5px 15px -5px hsla(215, 25%, 15%, 0.25),
    inset 0 1px 2px rgba(255, 255, 255, 0.10),
    0 0 0 1px hsla(215, 25%, 48%, 0.15);
}

/* Violet drag overlay for Professionals/Team context */
.glass-drag-overlay-violet {
  position: relative;
  border-radius: 0.75rem;
  box-shadow:
    0 25px 60px -15px hsla(270, 45%, 55%, 0.25),
    0 15px 35px -10px hsla(270, 45%, 55%, 0.18),
    0 5px 15px -5px hsla(270, 45%, 55%, 0.12),
    inset 0 1px 2px rgba(255, 255, 255, 0.25),
    0 0 0 1px hsla(270, 45%, 55%, 0.08);
  transition: none !important;
  will-change: transform;
  transform: none !important;
}

.dark .glass-drag-overlay-violet {
  box-shadow:
    0 25px 60px -15px hsla(270, 45%, 20%, 0.50),
    0 15px 35px -10px hsla(270, 45%, 20%, 0.35),
    0 5px 15px -5px hsla(270, 45%, 20%, 0.25),
    inset 0 1px 2px rgba(255, 255, 255, 0.10),
    0 0 0 1px hsla(270, 45%, 55%, 0.15);
}

/* Extended DnD guard */
.dnd-dragging .glass-drag-overlay-emerald,
.dnd-dragging .glass-drag-overlay-slate,
.dnd-dragging .glass-drag-overlay-violet {
  transform: none !important;
  transition: none !important;
}
```

---

## Samenvatting Bestanden

| Bestand | Wijzigingen |
|---------|-------------|
| `src/components/ClientCard.tsx` | Glass Card + HoverCard + Quick buttons |
| `src/components/organization/OrganizationCardSimple.tsx` | Glass Card + HoverCard + Quick buttons |
| `src/components/recruitment/ProfessionalCard.tsx` | Glass Card + HoverCard + Quick buttons |
| `src/components/organization/OrganizationCard.tsx` | Glass Card styling |
| `src/pages/Plaatsingen.tsx` | Glass placement cards |
| `src/components/ui/kpi-card.tsx` | Glass backdrop |
| `src/index.css` | +60 regels: Slate/Emerald/Violet glass + drag overlays |

---

## Kleurthema per Context

| Pagina/Context | HSL Kleur | Gebruik |
|----------------|-----------|---------|
| **Mijn Werk** | Indigo (234°) | Tasks, Kanban |
| **Kalender** | Teal (174°) | Calendar views |
| **Lijst** | Slate (215°) | Data tables |
| **Opvolging** | Amber (38°) | AI-driven follow-up |
| **Team** | Violet (270°) | Professionals |
| **Recruitment** | Rose (346°) | Applications |
| **Klanten** | Slate (215°) | Organizations |
| **Plaatsingen** | Emerald (142°) | Successful placements |

---

## Visueel Resultaat

```text
┌──────────────────────────────────────────────────────────────┐
│  KLANTEN PAGINA (Slate Context)                              │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  🏢 Zorggroep Amsterdam                             │     │
│  │  ░░░ SLATE SHADOW GLOW ░░░                          │     │
│  │  📞  ✉️  🌐  (glass buttons)                        │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  PROFESSIONALS PAGINA (Violet Context)                       │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  👤 Jan de Vries • HBO-V                            │     │
│  │  ░░░ VIOLET SHADOW GLOW ░░░                         │     │
│  │  📞  ✉️  📍  [Plaats Direct]                        │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  PLAATSINGEN PAGINA (Emerald Context)                        │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  ✅ Maria → GGZ Noord  •  Actief                    │     │
│  │  ░░░ EMERALD SUCCESS GLOW ░░░                       │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Design Principes

| Principe | Implementatie |
|----------|---------------|
| **No Transforms on Hover** | Alleen `box-shadow` voor depth |
| **Context Color** | Elke pagina krijgt zijn eigen HSL kleurschaal |
| **Glass Consistency** | `glass-hover-lift` + `glass-layer-2` op alle cards |
| **Premium Buttons** | Backdrop-blur + context-shadows op action buttons |
| **Dark Mode Ready** | Alle classes hebben `.dark` varianten |

---

## Technische Details

### Waarom geen `hover:scale` of `hover:-translate-y`?

1. **DnD Compatibiliteit**: Transforms kunnen dnd-kit's coordinate measurements verstoren
2. **Performance**: `box-shadow` is GPU-accelerated en veroorzaakt geen layout shifts
3. **visionOS Design**: Apple gebruikt alleen shadows voor depth, geen geometrische transforms

### Glass Button Pattern

```tsx
// Standard glass button pattern voor quick actions
className="h-7 px-2 bg-white/60 dark:bg-slate-900/60 
  backdrop-blur-sm border border-white/30 dark:border-white/10 
  shadow-[0_2px_6px_hsla(H,S%,L%,0.08)] 
  hover:bg-white/80 dark:hover:bg-slate-800/80 
  hover:shadow-[0_4px_10px_hsla(H,S%,L%,0.12)] 
  transition-all duration-200"
```

Waarbij `H,S%,L%` de context-kleur is (Slate, Violet, Emerald, etc.)

