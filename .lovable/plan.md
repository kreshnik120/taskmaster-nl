

# Fase 13: Apple visionOS Glassmorphism Verfijning — Expert Polish

## Executive Summary

Na grondige analyse van de volledige codebase is het glassmorphism systeem al uitgebreid geïmplementeerd. Er zijn echter nog **6 specifieke componenten** die nog geen glassmorphism behandeling hebben gekregen, wat de visuele consistentie breekt. Dit plan lost die gaps op.

---

## Geïdentificeerde Gaps (Expert Analyse)

| Component | Huidige Status | Context Kleur |
|-----------|----------------|---------------|
| `StatCards.tsx` | Basis styling, geen glass | Violet (Team tab) |
| `AssigneeProgress.tsx` | Simpele `hover:bg-muted/50` | Violet (Team tab) |
| `OverdueTasksList.tsx` | `bg-background border` | Destructive/Red (Urgentie) |
| `UrgencyBadge.tsx` | Geen glow op dot | Context-afhankelijk |
| `EmbeddedListView.tsx` KPIs | Gebruiken wel `KPICard` (OK) | Slate (Lijst tab) |
| `Layout.tsx` main content | Geen ambient glow achter content | Dynamisch |

---

## Wijzigingen (Technisch Detail)

### 1. StatCards.tsx — Violet-themed Glass Cards

**Probleem:** De StatCards in de Team tab gebruiken alleen `transition-all hover:shadow-md` zonder glassmorphism.

**Oplossing:** Upgrade naar `glass-card-violet` met context-gekleurde shadows.

**Wijzigingen (regels 21-54):**

```tsx
// variantStyles upgrade
const variantStyles = {
  default: 'glass-card-violet glass-hover-lift',
  warning: 'bg-destructive/10 border-destructive/20 glass-hover-lift shadow-[0_2px_6px_hsla(0,84%,60%,0.08),0_8px_24px_hsla(0,84%,60%,0.12)]',
  success: 'bg-green-500/10 border-green-500/20 glass-hover-lift shadow-[0_2px_6px_hsla(142,71%,45%,0.08),0_8px_24px_hsla(142,71%,45%,0.12)]',
  info: 'bg-primary/10 border-primary/20 glass-hover-lift shadow-[0_2px_6px_hsla(221,83%,53%,0.08),0_8px_24px_hsla(221,83%,53%,0.12)]',
};

// Card className upgrade (regel 37)
<Card className={cn("rounded-xl", variantStyles[variant])}>

// Icon container upgrade (regel 48)
<div className={cn(
  "p-2 rounded-full glass-layer-1 backdrop-blur-sm",
  iconStyles[variant]
)}>
```

### 2. AssigneeProgress.tsx — Violet Glass List Items

**Probleem:** Individuele medewerker items hebben simpele `p-3 rounded-lg border` zonder glassmorphism.

**Oplossing:** Glass list items met violet-tinted shadows.

**Wijzigingen (regels 81-88):**

```tsx
// Item wrapper upgrade
<div
  key={assignee.userId}
  onClick={() => handleClick(assignee.userId)}
  className={cn(
    "p-3 rounded-xl transition-all duration-200",
    "bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm",
    "border border-white/30 dark:border-white/12",
    "shadow-[0_2px_6px_hsla(270,45%,55%,0.06)]",
    isClickable && "cursor-pointer hover:bg-white/80 dark:hover:bg-slate-800/80 hover:shadow-[0_4px_12px_hsla(270,45%,55%,0.12)]"
  )}
>
```

**Card wrapper (regel 67):**

```tsx
<Card className="glass-card-violet">
```

### 3. OverdueTasksList.tsx — Destructive Glass Items

**Probleem:** Verlopen taken items hebben `bg-background border` zonder urgentie-glow.

**Oplossing:** Glass styling met rode urgentie-shadows.

**Wijzigingen (regels 73-77):**

```tsx
// Task item upgrade
<div
  key={task.id}
  onClick={() => handleClick(task.id)}
  className={cn(
    "p-3 rounded-xl transition-all duration-200 cursor-pointer group",
    "bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm",
    "border border-destructive/20 dark:border-destructive/30",
    "shadow-[0_2px_8px_hsla(0,84%,60%,0.08)]",
    "hover:bg-white/80 dark:hover:bg-slate-800/80",
    "hover:shadow-[0_4px_16px_hsla(0,84%,60%,0.15)]"
  )}
>
```

**Container Card (regels 61-62):**

```tsx
<Card className="border-destructive/30 bg-destructive/5 glass-hover-lift rounded-xl backdrop-blur-sm">
```

### 4. UrgencyBadge.tsx — Status Dot Glow

**Probleem:** De status dots zijn plat zonder diepte-indicatie.

**Oplossing:** `box-shadow: 0 0 Npx currentColor` voor ambient glow.

**Wijzigingen (regels 36-39):**

```tsx
// Dot with glow effect
<span className={cn(
  "h-1.5 w-1.5 rounded-full",
  "shadow-[0_0_4px_currentColor,0_0_8px_currentColor]", // Glow effect
  badgeClasses.dot
)} />
```

**Container upgrade (regels 32-35):**

```tsx
<span className={cn(
  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
  "backdrop-blur-sm shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.2)]",
  badgeClasses.container
)}>
```

### 5. CSS — Glass List Item Utility + Status Glow

**Bestand:** `src/index.css` (einde van bestand)

Nieuwe utility classes voor hergebruik:

```css
/* ============================================
   PHASE 13: LIST ITEM GLASS & STATUS GLOW
   ============================================ */

/* Universal glass list item */
.glass-list-item {
  position: relative;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.60);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.30);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.glass-list-item:hover {
  background: rgba(255, 255, 255, 0.80);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.dark .glass-list-item {
  background: rgba(30, 41, 59, 0.60);
  border-color: rgba(255, 255, 255, 0.12);
}

.dark .glass-list-item:hover {
  background: rgba(30, 41, 59, 0.80);
}

/* Violet-tinted list item for Team context */
.glass-list-item-violet {
  position: relative;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.60);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.30);
  box-shadow: 0 2px 6px hsla(270, 45%, 55%, 0.06);
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.glass-list-item-violet:hover {
  background: rgba(255, 255, 255, 0.80);
  box-shadow: 0 4px 12px hsla(270, 45%, 55%, 0.12);
}

.dark .glass-list-item-violet {
  background: rgba(30, 41, 59, 0.60);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 2px 6px hsla(270, 45%, 20%, 0.15);
}

.dark .glass-list-item-violet:hover {
  background: rgba(30, 41, 59, 0.80);
  box-shadow: 0 4px 12px hsla(270, 45%, 20%, 0.25);
}

/* Destructive-tinted list item for overdue items */
.glass-list-item-destructive {
  position: relative;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.60);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid hsla(0, 84%, 60%, 0.20);
  box-shadow: 0 2px 8px hsla(0, 84%, 60%, 0.08);
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.glass-list-item-destructive:hover {
  background: rgba(255, 255, 255, 0.80);
  box-shadow: 0 4px 16px hsla(0, 84%, 60%, 0.15);
}

.dark .glass-list-item-destructive {
  background: rgba(30, 41, 59, 0.60);
  border-color: hsla(0, 84%, 60%, 0.30);
  box-shadow: 0 2px 8px hsla(0, 84%, 40%, 0.20);
}

.dark .glass-list-item-destructive:hover {
  background: rgba(30, 41, 59, 0.80);
  box-shadow: 0 4px 16px hsla(0, 84%, 40%, 0.30);
}

/* Status dot glow effect - inherits color from parent */
.status-dot-glow {
  box-shadow: 0 0 4px currentColor, 0 0 8px currentColor;
}

/* Subtle status glow for less urgent items */
.status-dot-glow-subtle {
  box-shadow: 0 0 3px currentColor;
}
```

### 6. Progress Component Glow (Optioneel)

De `Progress` component heeft al glassmorphism. Geen wijzigingen nodig.

---

## Samenvatting Bestanden

| Bestand | Wijzigingen |
|---------|-------------|
| `src/components/dashboard-stats/StatCards.tsx` | Glass Card styling + violet shadows |
| `src/components/dashboard-stats/AssigneeProgress.tsx` | Glass list items + violet hover |
| `src/components/dashboard-stats/OverdueTasksList.tsx` | Destructive glass items + red glow |
| `src/components/ui/urgency-badge.tsx` | Status dot glow + glass container |
| `src/index.css` | +60 regels: list item utilities + status glow |

---

## Visueel Resultaat

```text
┌──────────────────────────────────────────────────────────────┐
│  TEAM TAB (Violet Context)                                   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  📊 STAT CARDS                                       │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │    │
│  │  │ Totaal  │  │  Open   │  │Afgerond │  │Verlopen │  │    │
│  │  │   42    │  │   18    │  │   24    │  │    3    │  │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │    │
│  │   ░░░ VIOLET GLASS + SHADOW GLOW ░░░                 │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  👥 PER MEDEWERKER                                     │  │
│  │                                                        │  │
│  │  ┌────────────────────────────────────────────────┐    │  │
│  │  │  👤 Jan de Vries  •  8/12 afgerond             │    │  │
│  │  │  ████████████░░░░░░░  67%                      │    │  │
│  │  │  ░░░ GLASS LIST ITEM + VIOLET HOVER ░░░        │    │  │
│  │  └────────────────────────────────────────────────┘    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  ⚠️ VERLOPEN TAKEN (3)                                 │  │
│  │                                                        │  │
│  │  ┌────────────────────────────────────────────────┐    │  │
│  │  │  📋 Intake gesprek plannen                     │    │  │
│  │  │     📅 15 jan  •  🔴✨ 2d verlopen (GLOW!)     │    │  │
│  │  │  ░░░ GLASS + RED URGENCY GLOW ░░░              │    │  │
│  │  └────────────────────────────────────────────────┘    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Design Principes (Apple visionOS)

| Principe | Implementatie |
|----------|---------------|
| **Layered Glass** | Nested blur levels (8px voor items, 20px voor containers) |
| **Context Color Shadows** | Elke component erft de tab-specifieke HSL kleur |
| **Status Glow** | Dots/indicators met `box-shadow: 0 0 Npx currentColor` |
| **Hover Feedback** | Verhoogde opacity en shadow (geen transforms!) |
| **Dark Mode Ready** | Alle classes hebben `.dark` varianten |

---

## Geen Wijzigingen Nodig

De volgende componenten hebben al correcte glassmorphism:
- `KPICard.tsx` — Heeft `glass-hover-lift` en backdrop-blur
- `TodayFocusCard.tsx` — Gebruikt `glass-card-indigo`
- `Progress.tsx` — Heeft backdrop-blur en inner shadows
- `Layout.tsx` — Sidebar glow effect werkt correct

---

## Acceptatiecriteria

1. StatCards in Team tab hebben violet glassmorphism met context shadows
2. AssigneeProgress items hebben glass styling met violet hover feedback
3. OverdueTasksList items hebben rode urgentie-glow bij verlopen status
4. UrgencyBadge dots hebben een ambient glow effect
5. Alle componenten zijn dark mode compatibel
6. Geen transforms die DnD kunnen verstoren (shadow-only hover)

