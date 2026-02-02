

# Fase 11: DnD-Fix & Glassmorphism Styling voor Andere Pagina's

## Overzicht

We passen dezelfde DnD cursor-fix en premium glassmorphism styling toe op de andere pagina's die drag-and-drop gebruiken. Elke pagina krijgt zijn eigen kleurthema conform het visionOS design system.

## Betreffende Bestanden & Kleurschema's

| Bestand | Kleurthema | HSL Basis |
|---------|------------|-----------|
| `Sollicitaties.tsx` | **Rose** (Recruitment) | `hsl(346, 77%, 50%)` |
| `EmbeddedCalendarView.tsx` | **Teal** (Kalender) | `hsl(172, 66%, 50%)` |
| `ApplicationCard.tsx` | **Rose** (Recruitment) | `hsl(346, 77%, 50%)` |

---

## Wijziging 1: Sollicitaties.tsx — Rose-themed DnD

### A) DnD Dragging Class Toggle

**Locatie:** Regels 281-288

```tsx
// VOOR
const handleDragStart = (event: DragStartEvent) => {
  const application = applications.find((a) => a.id === event.active.id);
  if (application) setActiveApplication(application);
};

const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event;
  setActiveApplication(null);
  // ...rest
};

// NA
const handleDragStart = (event: DragStartEvent) => {
  document.documentElement.classList.add('dnd-dragging');
  const application = applications.find((a) => a.id === event.active.id);
  if (application) setActiveApplication(application);
};

const handleDragEnd = async (event: DragEndEvent) => {
  document.documentElement.classList.remove('dnd-dragging');
  const { active, over } = event;
  setActiveApplication(null);
  // ...rest
};
```

### B) DragOverlay Premium Styling

**Locatie:** Regels 1276-1285

```tsx
// VOOR
<DragOverlay>
  {activeApplication ? (
    <div className="rotate-2">
      <ApplicationCard
        application={activeApplication}
        onClick={() => {}}
      />
    </div>
  ) : null}
</DragOverlay>

// NA - Rose-themed glass overlay
<DragOverlay dropAnimation={null}>
  {activeApplication ? (
    <div className="cursor-grabbing">
      <div className="glass-drag-overlay-rose">
        <ApplicationCard
          application={activeApplication}
          onClick={() => {}}
        />
      </div>
    </div>
  ) : null}
</DragOverlay>
```

---

## Wijziging 2: EmbeddedCalendarView.tsx — Teal-themed DnD

### A) DnD Dragging Class Toggle

**Locatie:** Regels 472-501

```tsx
// VOOR
const handleDragStart = (event: DragStartEvent) => {
  const { active } = event;
  const activeData = active.data.current;
  // ...set state
};

const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event;
  setActiveItem(null);
  // ...rest
};

// NA
const handleDragStart = (event: DragStartEvent) => {
  document.documentElement.classList.add('dnd-dragging');
  const { active } = event;
  const activeData = active.data.current;
  // ...set state
};

const handleDragEnd = async (event: DragEndEvent) => {
  document.documentElement.classList.remove('dnd-dragging');
  const { active, over } = event;
  setActiveItem(null);
  // ...rest
};
```

### B) DragOverlay Premium Styling

**Locatie:** Regels 902-913

```tsx
// VOOR
<DragOverlay>
  {activeItem && (
    <div className="p-2 rounded-lg bg-background border shadow-lg opacity-90">
      <p className="text-xs font-medium">
        {activeItem.type === 'task' 
          ? (activeItem.data as Task).title 
          : (activeItem.data as SubtaskFromHook).title
        }
      </p>
    </div>
  )}
</DragOverlay>

// NA - Teal-themed glass overlay
<DragOverlay dropAnimation={null}>
  {activeItem && (
    <div className="cursor-grabbing">
      <div className="glass-drag-overlay-teal p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-white/40 dark:border-white/15">
        <p className="text-xs font-medium">
          {activeItem.type === 'task' 
            ? (activeItem.data as Task).title 
            : (activeItem.data as SubtaskFromHook).title
          }
        </p>
      </div>
    </div>
  )}
</DragOverlay>
```

---

## Wijziging 3: ApplicationCard.tsx — Glass Styling

### A) Verwijder Transform-based Hover

**Locatie:** Regel 266

```tsx
// VOOR
<Card
  className={`hover:scale-[1.01] hover:shadow-md active:scale-[0.99] transition-all duration-200 ease-out border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 relative ${getCardBorder(completenessScore)}`}
>

// NA - Glass styling zonder transforms
<Card
  className={`glass-hover-lift bg-white/75 dark:bg-slate-900/75 border-white/40 dark:border-white/12 shadow-[0_2px_6px_hsla(346,77%,50%,0.06),0_8px_24px_hsla(346,77%,50%,0.10)] focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:ring-offset-2 relative rounded-xl ${getCardBorder(completenessScore)}`}
>
```

### B) Quick Action Buttons Glass Styling

**Locatie:** Regels 383-409

```tsx
// VOOR
<Button
  size="icon"
  variant="ghost"
  className="h-7 w-7"
  onClick={handleCall}
>

// NA - Glass buttons
<Button
  size="icon"
  variant="ghost"
  className="h-7 w-7 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-white/40 dark:border-white/15 shadow-[0_2px_8px_hsla(346,77%,50%,0.10)] hover:bg-white/90 dark:hover:bg-slate-800/90 hover:shadow-[0_4px_12px_hsla(346,77%,50%,0.15)] transition-all duration-200"
  onClick={handleCall}
>
```

---

## Wijziging 4: CSS — Context-Gekleurde Drag Overlays

**Bestand: `src/index.css`**

Voeg nieuwe kleur-specifieke drag overlay classes toe:

```css
/* ============================================
   CONTEXT-COLORED DRAG OVERLAYS - Phase 11
   Each tab context gets its own shadow color
   ============================================ */

/* Rose/Recruitment context */
.glass-drag-overlay-rose {
  position: relative;
  border-radius: 0.75rem;
  box-shadow:
    0 25px 60px -15px hsla(346, 77%, 50%, 0.25),
    0 15px 35px -10px hsla(346, 77%, 50%, 0.18),
    0 5px 15px -5px hsla(346, 77%, 50%, 0.12),
    inset 0 1px 2px rgba(255, 255, 255, 0.25),
    0 0 0 1px hsla(346, 77%, 50%, 0.08);
  transition: none !important;
  will-change: transform;
  transform: none !important;
}

.dark .glass-drag-overlay-rose {
  box-shadow:
    0 25px 60px -15px hsla(346, 77%, 20%, 0.50),
    0 15px 35px -10px hsla(346, 77%, 20%, 0.35),
    0 5px 15px -5px hsla(346, 77%, 20%, 0.25),
    inset 0 1px 2px rgba(255, 255, 255, 0.10),
    0 0 0 1px hsla(346, 77%, 50%, 0.15);
}

/* Teal/Calendar context */
.glass-drag-overlay-teal {
  position: relative;
  border-radius: 0.75rem;
  box-shadow:
    0 25px 60px -15px hsla(172, 66%, 50%, 0.25),
    0 15px 35px -10px hsla(172, 66%, 50%, 0.18),
    0 5px 15px -5px hsla(172, 66%, 50%, 0.12),
    inset 0 1px 2px rgba(255, 255, 255, 0.25),
    0 0 0 1px hsla(172, 66%, 50%, 0.08);
  transition: none !important;
  will-change: transform;
  transform: none !important;
}

.dark .glass-drag-overlay-teal {
  box-shadow:
    0 25px 60px -15px hsla(172, 66%, 20%, 0.50),
    0 15px 35px -10px hsla(172, 66%, 20%, 0.35),
    0 5px 15px -5px hsla(172, 66%, 20%, 0.25),
    inset 0 1px 2px rgba(255, 255, 255, 0.10),
    0 0 0 1px hsla(172, 66%, 50%, 0.15);
}

/* Extend DnD guard to cover all context overlays */
.dnd-dragging .glass-drag-overlay-rose,
.dnd-dragging .glass-drag-overlay-teal,
.dnd-dragging .glass-drag-overlay-enhanced {
  /* Already have transform: none, but ensure consistency */
}
```

---

## Wijziging 5: HoverCard Content Glass Styling

**ApplicationCard.tsx** regel 414:

```tsx
// VOOR
<HoverCardContent className="w-80" side="right" align="start">

// NA
<HoverCardContent className="w-80 glass-layer-2 glass-light-bleed rounded-xl" side="right" align="start">
```

---

## Samenvatting Wijzigingen

| Bestand | Wijzigingen |
|---------|-------------|
| `src/pages/Sollicitaties.tsx` | DnD class toggle + Rose-themed DragOverlay |
| `src/components/dashboard/EmbeddedCalendarView.tsx` | DnD class toggle + Teal-themed DragOverlay |
| `src/components/ApplicationCard.tsx` | Glass hover (geen transforms) + Rose shadows + Glass buttons |
| `src/index.css` | +40 regels: `.glass-drag-overlay-rose`, `.glass-drag-overlay-teal` |

---

## Visueel Resultaat

```text
┌──────────────────────────────────────────────────────────────────┐
│  SOLLICITATIES (Rose Context)                                    │
│                                                                  │
│  Kandidaat Kaart                                                 │
│  ┌────────────────────────────┐                                  │
│  │  👤 Jan de Vries          │                                  │
│  │  📧 jan@email.nl          │                                  │
│  │  💼 ZZP • HBO+            │                                  │
│  └────────────────────────────┘                                  │
│  ░░░░ ROSE SHADOW GLOW ░░░░░                                     │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  KALENDER (Teal Context)                                         │
│                                                                  │
│  Taak Item                                                       │
│  ┌────────────────────────────┐                                  │
│  │  📋 Intake gesprek        │                                  │
│  └────────────────────────────┘                                  │
│  ░░░░ TEAL SHADOW GLOW ░░░░░                                     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Design Principes

| Principe | Implementatie |
|----------|---------------|
| **Context Color** | Rose (346°) voor Recruitment, Teal (172°) voor Kalender, Indigo (234°) voor Mijn Werk |
| **No Transforms** | Alle drag overlays gebruiken alleen shadows voor depth |
| **Consistent Guard** | `.dnd-dragging` class bevriest alle hover effects globaal |
| **Glass Consistency** | ApplicationCard krijgt dezelfde treatment als TaskCard |

