

# Premium Enterprise Tab Kleurcodering Systeem

## Overzicht

Implementatie van een high-end kleurcodering systeem dat gebruikers direct visueel laat weten in welke tab ze zich bevinden, met Apple/Stripe-niveau polish en vloeiende transitions.

---

## Kleurenpalet

| Tab | Kleur | HSL Base | Semantiek |
|-----|-------|----------|-----------|
| Mijn Werk | Indigo | 234, 45%, L | Focus, persoonlijk |
| Kalender | Teal | 174, 42%, L | Tijd, planning |
| Lijst | Slate | 215, 25%, L | Data, neutraal |
| Opvolging | Amber | 38, 55%, L | Urgentie, AI-driven |
| Team | Violet | 270, 45%, L | Samenwerking |
| Recruitment | Rose | 345, 48%, L | Groei, mensen |

---

## Visueel Resultaat

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌── HEADER (Dynamische kleur) ──────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  [🟣] Dashboard                                                       │  │
│  │       Mijn Werk                                                       │  │
│  │   ↑                                                                   │  │
│  │   Indigo icon bg + text                                               │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌── TABS (Gekleurde indicators) ────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  ╔═══════════════╗                                                    │  │
│  │  ║  Mijn Werk    ║  Kalender   Lijst   Opvolging   Team   Recruitment │  │
│  │  ╚═══════════════╝                                                    │  │
│  │   indigo-100 bg    ━━━━━━━━━                                          │  │
│  │   indigo-700 text  (indicator)                                        │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Technische Wijzigingen

### Bestand 1: `src/index.css`

**Toe te voegen in `:root` (na regel 100):**

```css
/* ============================================
   TAB CONTEXT COLORS - Enterprise Premium
   ============================================ */

/* Mijn Werk - Indigo (Focus, Personal) */
--tab-mijn-werk-50: 234 45% 97%;
--tab-mijn-werk-100: 234 45% 94%;
--tab-mijn-werk-200: 234 45% 88%;
--tab-mijn-werk-300: 234 45% 78%;
--tab-mijn-werk-400: 234 45% 66%;
--tab-mijn-werk-500: 234 45% 52%;
--tab-mijn-werk-600: 234 45% 44%;
--tab-mijn-werk-700: 234 45% 38%;
--tab-mijn-werk-800: 234 45% 32%;
--tab-mijn-werk-900: 234 45% 26%;

/* Kalender - Teal (Time, Planning) */
--tab-kalender-50: 174 42% 97%;
--tab-kalender-100: 174 42% 93%;
--tab-kalender-200: 174 42% 85%;
--tab-kalender-300: 174 42% 73%;
--tab-kalender-400: 174 42% 58%;
--tab-kalender-500: 174 42% 43%;
--tab-kalender-600: 174 42% 36%;
--tab-kalender-700: 174 42% 30%;
--tab-kalender-800: 174 42% 24%;
--tab-kalender-900: 174 42% 18%;

/* Lijst - Slate (Data, Neutral) */
--tab-lijst-50: 215 25% 97%;
--tab-lijst-100: 215 25% 94%;
--tab-lijst-200: 215 25% 88%;
--tab-lijst-300: 215 25% 78%;
--tab-lijst-400: 215 25% 62%;
--tab-lijst-500: 215 25% 48%;
--tab-lijst-600: 215 25% 40%;
--tab-lijst-700: 215 25% 34%;
--tab-lijst-800: 215 25% 28%;
--tab-lijst-900: 215 25% 22%;

/* Opvolging - Amber (Urgency, AI-driven) */
--tab-opvolging-50: 38 55% 97%;
--tab-opvolging-100: 38 55% 93%;
--tab-opvolging-200: 38 55% 85%;
--tab-opvolging-300: 38 55% 74%;
--tab-opvolging-400: 38 55% 62%;
--tab-opvolging-500: 38 55% 50%;
--tab-opvolging-600: 38 55% 42%;
--tab-opvolging-700: 38 55% 36%;
--tab-opvolging-800: 38 55% 30%;
--tab-opvolging-900: 38 55% 24%;

/* Team - Violet (Collaboration) */
--tab-team-50: 270 45% 97%;
--tab-team-100: 270 45% 93%;
--tab-team-200: 270 45% 86%;
--tab-team-300: 270 45% 76%;
--tab-team-400: 270 45% 65%;
--tab-team-500: 270 45% 55%;
--tab-team-600: 270 45% 47%;
--tab-team-700: 270 45% 40%;
--tab-team-800: 270 45% 34%;
--tab-team-900: 270 45% 28%;

/* Recruitment - Rose (Growth, People) */
--tab-recruitment-50: 345 48% 97%;
--tab-recruitment-100: 345 48% 93%;
--tab-recruitment-200: 345 48% 86%;
--tab-recruitment-300: 345 48% 75%;
--tab-recruitment-400: 345 48% 63%;
--tab-recruitment-500: 345 48% 52%;
--tab-recruitment-600: 345 48% 44%;
--tab-recruitment-700: 345 48% 38%;
--tab-recruitment-800: 345 48% 32%;
--tab-recruitment-900: 345 48% 26%;

/* Spring Physics Transitions */
--ease-spring-soft: cubic-bezier(0.22, 1.2, 0.36, 1);
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
--duration-normal: 250ms;
--duration-slow: 400ms;
```

**Dark mode aanpassingen toevoegen in `.dark` (na regel 152):**

```css
/* Tab colors - Dark mode (lighter primaries) */
--tab-mijn-werk-300: 234 45% 72%;
--tab-kalender-300: 174 42% 68%;
--tab-lijst-300: 215 25% 72%;
--tab-opvolging-300: 38 55% 68%;
--tab-team-300: 270 45% 70%;
--tab-recruitment-300: 345 48% 70%;
```

**Toe te voegen in `@layer components` (na regel 178):**

```css
/* Glassmorphism Panel */
.glass-panel {
  @apply bg-white/72 dark:bg-slate-900/72;
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid hsla(220, 15%, 90%, 0.6);
}

.dark .glass-panel {
  border-color: hsla(220, 15%, 20%, 0.6);
}

/* Tab Content Transition */
.tab-content-transition {
  @apply transition-all;
  transition-duration: 400ms;
  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}
```

---

### Bestand 2: `tailwind.config.ts`

**Toe te voegen in `theme.extend.colors` (na regel 91):**

```typescript
tab: {
  "mijn-werk": {
    50: "hsl(var(--tab-mijn-werk-50))",
    100: "hsl(var(--tab-mijn-werk-100))",
    200: "hsl(var(--tab-mijn-werk-200))",
    300: "hsl(var(--tab-mijn-werk-300))",
    400: "hsl(var(--tab-mijn-werk-400))",
    500: "hsl(var(--tab-mijn-werk-500))",
    600: "hsl(var(--tab-mijn-werk-600))",
    700: "hsl(var(--tab-mijn-werk-700))",
    800: "hsl(var(--tab-mijn-werk-800))",
    900: "hsl(var(--tab-mijn-werk-900))",
    DEFAULT: "hsl(var(--tab-mijn-werk-500))",
  },
  kalender: {
    50: "hsl(var(--tab-kalender-50))",
    100: "hsl(var(--tab-kalender-100))",
    200: "hsl(var(--tab-kalender-200))",
    300: "hsl(var(--tab-kalender-300))",
    400: "hsl(var(--tab-kalender-400))",
    500: "hsl(var(--tab-kalender-500))",
    600: "hsl(var(--tab-kalender-600))",
    700: "hsl(var(--tab-kalender-700))",
    800: "hsl(var(--tab-kalender-800))",
    900: "hsl(var(--tab-kalender-900))",
    DEFAULT: "hsl(var(--tab-kalender-500))",
  },
  lijst: {
    50: "hsl(var(--tab-lijst-50))",
    100: "hsl(var(--tab-lijst-100))",
    200: "hsl(var(--tab-lijst-200))",
    300: "hsl(var(--tab-lijst-300))",
    400: "hsl(var(--tab-lijst-400))",
    500: "hsl(var(--tab-lijst-500))",
    600: "hsl(var(--tab-lijst-600))",
    700: "hsl(var(--tab-lijst-700))",
    800: "hsl(var(--tab-lijst-800))",
    900: "hsl(var(--tab-lijst-900))",
    DEFAULT: "hsl(var(--tab-lijst-500))",
  },
  opvolging: {
    50: "hsl(var(--tab-opvolging-50))",
    100: "hsl(var(--tab-opvolging-100))",
    200: "hsl(var(--tab-opvolging-200))",
    300: "hsl(var(--tab-opvolging-300))",
    400: "hsl(var(--tab-opvolging-400))",
    500: "hsl(var(--tab-opvolging-500))",
    600: "hsl(var(--tab-opvolging-600))",
    700: "hsl(var(--tab-opvolging-700))",
    800: "hsl(var(--tab-opvolging-800))",
    900: "hsl(var(--tab-opvolging-900))",
    DEFAULT: "hsl(var(--tab-opvolging-500))",
  },
  team: {
    50: "hsl(var(--tab-team-50))",
    100: "hsl(var(--tab-team-100))",
    200: "hsl(var(--tab-team-200))",
    300: "hsl(var(--tab-team-300))",
    400: "hsl(var(--tab-team-400))",
    500: "hsl(var(--tab-team-500))",
    600: "hsl(var(--tab-team-600))",
    700: "hsl(var(--tab-team-700))",
    800: "hsl(var(--tab-team-800))",
    900: "hsl(var(--tab-team-900))",
    DEFAULT: "hsl(var(--tab-team-500))",
  },
  recruitment: {
    50: "hsl(var(--tab-recruitment-50))",
    100: "hsl(var(--tab-recruitment-100))",
    200: "hsl(var(--tab-recruitment-200))",
    300: "hsl(var(--tab-recruitment-300))",
    400: "hsl(var(--tab-recruitment-400))",
    500: "hsl(var(--tab-recruitment-500))",
    600: "hsl(var(--tab-recruitment-600))",
    700: "hsl(var(--tab-recruitment-700))",
    800: "hsl(var(--tab-recruitment-800))",
    900: "hsl(var(--tab-recruitment-900))",
    DEFAULT: "hsl(var(--tab-recruitment-500))",
  },
},
```

**Toe te voegen in `theme.extend` (na `animation`):**

```typescript
boxShadow: {
  "tab-mijn-werk": "0 2px 4px -1px hsla(234, 45%, 52%, 0.06), 0 4px 8px -2px hsla(234, 45%, 52%, 0.08)",
  "tab-kalender": "0 2px 4px -1px hsla(174, 42%, 43%, 0.06), 0 4px 8px -2px hsla(174, 42%, 43%, 0.08)",
  "tab-lijst": "0 2px 4px -1px hsla(215, 25%, 48%, 0.04), 0 4px 8px -2px hsla(215, 25%, 48%, 0.06)",
  "tab-opvolging": "0 2px 4px -1px hsla(38, 55%, 50%, 0.06), 0 4px 8px -2px hsla(38, 55%, 50%, 0.08)",
  "tab-team": "0 2px 4px -1px hsla(270, 45%, 55%, 0.06), 0 4px 8px -2px hsla(270, 45%, 55%, 0.08)",
  "tab-recruitment": "0 2px 4px -1px hsla(345, 48%, 52%, 0.06), 0 4px 8px -2px hsla(345, 48%, 52%, 0.08)",
},
transitionTimingFunction: {
  "spring-soft": "cubic-bezier(0.22, 1.2, 0.36, 1)",
  "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
},
```

---

### Bestand 3: `src/lib/constants/designTokens.ts`

**Toe te voegen aan het einde van het bestand:**

```typescript
// ============================================
// TAB CONTEXT COLORS - Enterprise Premium
// ============================================

export const TAB_CONTEXT_COLORS = {
  'mijn-werk': {
    name: 'Mijn Werk',
    accent: 'text-tab-mijn-werk-700 dark:text-tab-mijn-werk-300',
    background: 'bg-tab-mijn-werk-100 dark:bg-tab-mijn-werk-900/50',
    indicator: 'bg-tab-mijn-werk-500',
    iconBg: 'bg-tab-mijn-werk-100/80 dark:bg-tab-mijn-werk-900/40',
    shadow: 'shadow-tab-mijn-werk',
    border: 'border-tab-mijn-werk-200 dark:border-tab-mijn-werk-800',
    hoverBorder: 'hover:border-tab-mijn-werk-300',
  },
  'kalender': {
    name: 'Kalender',
    accent: 'text-tab-kalender-700 dark:text-tab-kalender-300',
    background: 'bg-tab-kalender-100 dark:bg-tab-kalender-900/50',
    indicator: 'bg-tab-kalender-500',
    iconBg: 'bg-tab-kalender-100/80 dark:bg-tab-kalender-900/40',
    shadow: 'shadow-tab-kalender',
    border: 'border-tab-kalender-200 dark:border-tab-kalender-800',
    hoverBorder: 'hover:border-tab-kalender-300',
  },
  'lijst': {
    name: 'Lijst',
    accent: 'text-tab-lijst-700 dark:text-tab-lijst-300',
    background: 'bg-tab-lijst-100 dark:bg-tab-lijst-900/50',
    indicator: 'bg-tab-lijst-500',
    iconBg: 'bg-tab-lijst-100/80 dark:bg-tab-lijst-900/40',
    shadow: 'shadow-tab-lijst',
    border: 'border-tab-lijst-200 dark:border-tab-lijst-800',
    hoverBorder: 'hover:border-tab-lijst-300',
  },
  'opvolging': {
    name: 'Opvolging',
    accent: 'text-tab-opvolging-700 dark:text-tab-opvolging-300',
    background: 'bg-tab-opvolging-100 dark:bg-tab-opvolging-900/50',
    indicator: 'bg-tab-opvolging-500',
    iconBg: 'bg-tab-opvolging-100/80 dark:bg-tab-opvolging-900/40',
    shadow: 'shadow-tab-opvolging',
    border: 'border-tab-opvolging-200 dark:border-tab-opvolging-800',
    hoverBorder: 'hover:border-tab-opvolging-300',
  },
  'team': {
    name: 'Team',
    accent: 'text-tab-team-700 dark:text-tab-team-300',
    background: 'bg-tab-team-100 dark:bg-tab-team-900/50',
    indicator: 'bg-tab-team-500',
    iconBg: 'bg-tab-team-100/80 dark:bg-tab-team-900/40',
    shadow: 'shadow-tab-team',
    border: 'border-tab-team-200 dark:border-tab-team-800',
    hoverBorder: 'hover:border-tab-team-300',
  },
  'recruitment': {
    name: 'Recruitment',
    accent: 'text-tab-recruitment-700 dark:text-tab-recruitment-300',
    background: 'bg-tab-recruitment-100 dark:bg-tab-recruitment-900/50',
    indicator: 'bg-tab-recruitment-500',
    iconBg: 'bg-tab-recruitment-100/80 dark:bg-tab-recruitment-900/40',
    shadow: 'shadow-tab-recruitment',
    border: 'border-tab-recruitment-200 dark:border-tab-recruitment-800',
    hoverBorder: 'hover:border-tab-recruitment-300',
  },
} as const;

export type TabContextKey = keyof typeof TAB_CONTEXT_COLORS;

export function getTabColors(tabId: string) {
  return TAB_CONTEXT_COLORS[tabId as TabContextKey] 
    || TAB_CONTEXT_COLORS['mijn-werk'];
}
```

---

### Bestand 4: `src/pages/UnifiedDashboard.tsx`

**Wijziging 1: Import toevoegen (regel 1-7)**

```typescript
import { useEffect, useState, Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutDashboard, User, Users, Briefcase, List, Calendar, TrendingUp, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getTabColors } from "@/lib/constants/designTokens";
```

**Wijziging 2: Page Header (regels 125-138)**

Vervangen door dynamische header met tab-kleur:

```typescript
{/* Page Header - Dynamic Color */}
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
  <div className="flex items-center gap-3">
    <div className={cn(
      "p-2 rounded-lg transition-all duration-300 ease-out-expo",
      getTabColors(activeTab).iconBg
    )}>
      <LayoutDashboard className={cn(
        "h-6 w-6 transition-colors duration-300",
        getTabColors(activeTab).accent
      )} />
    </div>
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className={cn(
        "text-sm transition-colors duration-300",
        getTabColors(activeTab).accent,
        "opacity-80"
      )}>
        {getTabColors(activeTab).name}
      </p>
    </div>
  </div>
</div>
```

**Wijziging 3: TabsTrigger styling (regels 142-167)**

Vervangen door premium styled tabs met indicators:

```typescript
<TabsList className="grid grid-cols-3 md:grid-cols-6 w-full bg-muted/50">
  {/* Mijn Werk */}
  <TabsTrigger 
    value="mijn-werk" 
    className={cn(
      "gap-2 relative transition-all duration-300 ease-out-expo",
      activeTab === "mijn-werk" && [
        "bg-tab-mijn-werk-100 dark:bg-tab-mijn-werk-900/50",
        "text-tab-mijn-werk-700 dark:text-tab-mijn-werk-300",
        "shadow-tab-mijn-werk"
      ]
    )}
  >
    <User className="h-4 w-4" />
    <span className="hidden sm:inline">Mijn Werk</span>
    {activeTab === "mijn-werk" && (
      <span className="absolute -bottom-[1px] left-2 right-2 h-0.5 rounded-full bg-tab-mijn-werk-500" />
    )}
  </TabsTrigger>
  
  {/* Kalender */}
  <TabsTrigger 
    value="kalender" 
    className={cn(
      "gap-2 relative transition-all duration-300 ease-out-expo",
      activeTab === "kalender" && [
        "bg-tab-kalender-100 dark:bg-tab-kalender-900/50",
        "text-tab-kalender-700 dark:text-tab-kalender-300",
        "shadow-tab-kalender"
      ]
    )}
  >
    <Calendar className="h-4 w-4" />
    <span className="hidden sm:inline">Kalender</span>
    {activeTab === "kalender" && (
      <span className="absolute -bottom-[1px] left-2 right-2 h-0.5 rounded-full bg-tab-kalender-500" />
    )}
  </TabsTrigger>
  
  {/* Lijst */}
  <TabsTrigger 
    value="lijst" 
    className={cn(
      "gap-2 relative transition-all duration-300 ease-out-expo",
      activeTab === "lijst" && [
        "bg-tab-lijst-100 dark:bg-tab-lijst-900/50",
        "text-tab-lijst-700 dark:text-tab-lijst-300",
        "shadow-tab-lijst"
      ]
    )}
  >
    <List className="h-4 w-4" />
    <span className="hidden sm:inline">Lijst</span>
    {activeTab === "lijst" && (
      <span className="absolute -bottom-[1px] left-2 right-2 h-0.5 rounded-full bg-tab-lijst-500" />
    )}
  </TabsTrigger>
  
  {/* Opvolging */}
  <TabsTrigger 
    value="opvolging" 
    className={cn(
      "gap-2 relative transition-all duration-300 ease-out-expo",
      activeTab === "opvolging" && [
        "bg-tab-opvolging-100 dark:bg-tab-opvolging-900/50",
        "text-tab-opvolging-700 dark:text-tab-opvolging-300",
        "shadow-tab-opvolging"
      ]
    )}
  >
    <TrendingUp className="h-4 w-4" />
    <span className="hidden sm:inline">Opvolging</span>
    {activeTab === "opvolging" && (
      <span className="absolute -bottom-[1px] left-2 right-2 h-0.5 rounded-full bg-tab-opvolging-500" />
    )}
  </TabsTrigger>
  
  {/* Team */}
  <TabsTrigger 
    value="team" 
    className={cn(
      "gap-2 relative transition-all duration-300 ease-out-expo",
      activeTab === "team" && [
        "bg-tab-team-100 dark:bg-tab-team-900/50",
        "text-tab-team-700 dark:text-tab-team-300",
        "shadow-tab-team"
      ]
    )}
  >
    <Users className="h-4 w-4" />
    <span className="hidden sm:inline">Team</span>
    {activeTab === "team" && (
      <span className="absolute -bottom-[1px] left-2 right-2 h-0.5 rounded-full bg-tab-team-500" />
    )}
  </TabsTrigger>
  
  {/* Recruitment */}
  <TabsTrigger 
    value="recruitment" 
    className={cn(
      "gap-2 relative transition-all duration-300 ease-out-expo",
      activeTab === "recruitment" && [
        "bg-tab-recruitment-100 dark:bg-tab-recruitment-900/50",
        "text-tab-recruitment-700 dark:text-tab-recruitment-300",
        "shadow-tab-recruitment"
      ]
    )}
  >
    <Briefcase className="h-4 w-4" />
    <span className="hidden sm:inline">Recruitment</span>
    {activeTab === "recruitment" && (
      <span className="absolute -bottom-[1px] left-2 right-2 h-0.5 rounded-full bg-tab-recruitment-500" />
    )}
  </TabsTrigger>
</TabsList>
```

---

## Accessibility

Al ingebouwd in `src/index.css` (regels 181-189):

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Verificatie Checklist

| Test | Verwacht Resultaat |
|------|-------------------|
| Tab wisseling | Vloeiende 300ms transition, geen flicker |
| Actieve tab | Gekleurde achtergrond + bottom indicator |
| Header icon | Kleur past zich aan bij tab wissel |
| Header subtitle | Toont huidige tab naam |
| Dark mode | Kleuren zijn lichter (300-range) |
| Reduced motion | Geen animaties |
| WCAG contrast | Alle tab-700 op tab-100 > 4.5:1 |
| Mobile | Werkt responsive, icons blijven zichtbaar |

---

## Bestanden Overzicht

| Bestand | Wijziging | ~Lines |
|---------|-----------|--------|
| `src/index.css` | CSS variabelen + glassmorphism | +85 |
| `tailwind.config.ts` | Tab kleuren + shadows + easing | +95 |
| `src/lib/constants/designTokens.ts` | TAB_CONTEXT_COLORS + helper | +75 |
| `src/pages/UnifiedDashboard.tsx` | Dynamische styling | +80 |

**Totaal: ~335 nieuwe regels code**

