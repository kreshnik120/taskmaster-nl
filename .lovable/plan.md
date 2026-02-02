

# Expert-Niveau Glassmorphism Fase 5: Contextuele Kleuridentiteit & Perfecte Separatie

## Expertanalyse: Wat Ontbreekt Er Nog?

Na grondige analyse van de codebase identificeer ik als UI/UX specialist gespecialiseerd in Apple Design Systems de volgende verbeterpunten:

---

## 1. PROBLEEM: Alleen "Mijn Werk" Tab Heeft Kleur

**Huidige Staat:**
- `glass-card-indigo` bestaat alleen voor Indigo (Mijn Werk)
- `shadow-float-indigo` bestaat alleen voor Indigo
- Andere tabs (Kalender, Lijst, Opvolging, Team, Recruitment) gebruiken generieke schaduwen

**Expert Oplossing:**
Creëer een compleet kleursysteem voor ELKE tab - zodat gebruikers direct aan de schaduwkleur kunnen zien op welke pagina ze zitten.

```text
Tab              | HSL Kleur          | Shadow Class
─────────────────┼────────────────────┼─────────────────────
Mijn Werk        | 234, 45%           | shadow-float-indigo ✓
Kalender         | 174, 42%           | shadow-float-teal (NIEUW)
Lijst            | 215, 25%           | shadow-float-slate (NIEUW)
Opvolging        | 38, 55%            | shadow-float-amber (NIEUW)
Team             | 270, 45%           | shadow-float-violet (NIEUW)
Recruitment      | 345, 48%           | shadow-float-rose (NIEUW)
```

---

## 2. PROBLEEM: Sidebar Heeft Geen Visuele Separatie

**Huidige Staat:**
De sidebar en main content hebben dezelfde achtergrondkleur. Er is geen duidelijke visuele "kloof" die het zwevende effect versterkt.

**Expert Oplossing: Subtle Background Gradient**
Voeg een subtiele gradient toe aan de main content area die lichter wordt naarmate je verder van de sidebar bent:

```css
/* Sidebar separation effect */
.main-content-gradient {
  background: linear-gradient(
    90deg,
    hsla(234, 45%, 98%, 0.5) 0%,
    transparent 10%
  );
}
```

---

## 3. PROBLEEM: Geen Dynamische Kleurwisseling Bij Tab Change

**Huidige Staat:**
- Tab indicator kleurt correct
- Maar de CONTAINER schaduwen blijven altijd Indigo

**Expert Oplossing:**
De glass-layer-1 container moet dynamisch de context-kleur krijgen via CSS custom properties die wisselen per tab:

```tsx
// UnifiedDashboard.tsx - Dynamic context color
<div 
  className="glass-layer-1"
  style={{ '--context-hue': getTabHue(activeTab) } as React.CSSProperties}
>
```

```css
/* CSS met dynamic hue */
.glass-layer-1 {
  box-shadow:
    0 4px 16px hsla(var(--context-hue), 45%, 52%, 0.06),
    0 12px 40px hsla(var(--context-hue), 45%, 52%, 0.08);
}
```

---

## 4. PROBLEEM: Embedded Views Missen Kleur Context

**Huidige Staat:**
- `EmbeddedCalendarView`, `EmbeddedListView`, `EmbeddedOpvolgingView` gebruiken standaard Card styling
- Ze "weten" niet welke tab-context ze hebben

**Expert Oplossing:**
Voeg een context-aware wrapper toe die automatisch de juiste kleur toepast:

```tsx
// Kalender tab
<TabsContent value="kalender">
  <div className="glass-layer-1 glass-context-teal p-6 rounded-2xl">
    <EmbeddedCalendarView />
  </div>
</TabsContent>
```

---

## 5. PROBLEEM: KPI Cards Hebben Geen Context-Kleuren

**Huidige Staat:**
KPI cards in Kalender/Opvolging views gebruiken generieke kleuren.

**Expert Oplossing:**
Geef KPI cards een subtiele tint van de huidige tab-context:

```css
/* KPI card in Kalender context */
.context-teal .kpi-card {
  box-shadow: 0 4px 12px hsla(174, 42%, 43%, 0.08);
  border-left: 2px solid hsla(174, 42%, 43%, 0.3);
}
```

---

## 6. NIEUW: Sidebar "Glow" Effect

**Expert Techniek:**
Voeg een subtiele glow toe aan de sidebar-rand die de active tab kleur weerspiegelt:

```css
/* Sidebar right-edge glow */
[data-sidebar="sidebar"]::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 1px;
  background: linear-gradient(
    180deg,
    transparent 0%,
    hsla(var(--active-tab-hue), 45%, 52%, 0.3) 50%,
    transparent 100%
  );
}
```

---

## Technische Implementatie

### Fase 5.1: CSS Kleur Tokens Uitbreiden

**Bestand: `src/index.css`**

Voeg shadow classes toe voor alle 6 tabs:

```css
/* ============================================
   TAB-SPECIFIC FLOATING SHADOWS
   ============================================ */

/* Teal (Kalender) */
.shadow-float-teal {
  box-shadow: 
    0 4px 8px rgba(0, 0, 0, 0.04),
    0 8px 24px hsla(174, 42%, 43%, 0.10),
    0 16px 48px hsla(174, 42%, 43%, 0.08);
}

/* Slate (Lijst) */
.shadow-float-slate {
  box-shadow: 
    0 4px 8px rgba(0, 0, 0, 0.04),
    0 8px 24px hsla(215, 25%, 48%, 0.10),
    0 16px 48px hsla(215, 25%, 48%, 0.08);
}

/* Amber (Opvolging) */
.shadow-float-amber {
  box-shadow: 
    0 4px 8px rgba(0, 0, 0, 0.04),
    0 8px 24px hsla(38, 55%, 50%, 0.10),
    0 16px 48px hsla(38, 55%, 50%, 0.08);
}

/* Violet (Team) */
.shadow-float-violet {
  box-shadow: 
    0 4px 8px rgba(0, 0, 0, 0.04),
    0 8px 24px hsla(270, 45%, 55%, 0.10),
    0 16px 48px hsla(270, 45%, 55%, 0.08);
}

/* Rose (Recruitment) */
.shadow-float-rose {
  box-shadow: 
    0 4px 8px rgba(0, 0, 0, 0.04),
    0 8px 24px hsla(345, 48%, 52%, 0.10),
    0 16px 48px hsla(345, 48%, 52%, 0.08);
}
```

Voeg ook glass-card varianten toe per kleur:

```css
/* Teal-tinted glass for Kalender */
.glass-card-teal {
  background: linear-gradient(135deg, hsla(174, 42%, 97%, 0.75) 0%, hsla(174, 42%, 97%, 0.45) 100%);
  border: 1px solid hsla(174, 42%, 85%, 0.5);
  box-shadow: 0 4px 12px hsla(174, 42%, 43%, 0.08), 0 8px 32px hsla(174, 42%, 43%, 0.12);
}

/* Amber-tinted glass for Opvolging */
.glass-card-amber {
  background: linear-gradient(135deg, hsla(38, 55%, 97%, 0.75) 0%, hsla(38, 55%, 97%, 0.45) 100%);
  border: 1px solid hsla(38, 55%, 85%, 0.5);
  box-shadow: 0 4px 12px hsla(38, 55%, 50%, 0.08), 0 8px 32px hsla(38, 55%, 50%, 0.12);
}

/* Violet-tinted glass for Team */
.glass-card-violet {
  background: linear-gradient(135deg, hsla(270, 45%, 97%, 0.75) 0%, hsla(270, 45%, 97%, 0.45) 100%);
  border: 1px solid hsla(270, 45%, 86%, 0.5);
  box-shadow: 0 4px 12px hsla(270, 45%, 55%, 0.08), 0 8px 32px hsla(270, 45%, 55%, 0.12);
}

/* Rose-tinted glass for Recruitment */
.glass-card-rose {
  background: linear-gradient(135deg, hsla(345, 48%, 97%, 0.75) 0%, hsla(345, 48%, 97%, 0.45) 100%);
  border: 1px solid hsla(345, 48%, 86%, 0.5);
  box-shadow: 0 4px 12px hsla(345, 48%, 52%, 0.08), 0 8px 32px hsla(345, 48%, 52%, 0.12);
}
```

---

### Fase 5.2: Design Tokens Uitbreiden

**Bestand: `src/lib/constants/designTokens.ts`**

Voeg glassClass en shadowClass toe aan TAB_CONTEXT_COLORS:

```typescript
export const TAB_CONTEXT_COLORS = {
  'mijn-werk': {
    ...existing,
    glassClass: 'glass-card-indigo',
    shadowClass: 'shadow-float-indigo',
    hue: 234,
  },
  'kalender': {
    ...existing,
    glassClass: 'glass-card-teal',
    shadowClass: 'shadow-float-teal',
    hue: 174,
  },
  'lijst': {
    ...existing,
    glassClass: 'glass-layer-1', // Slate is neutral
    shadowClass: 'shadow-float-slate',
    hue: 215,
  },
  'opvolging': {
    ...existing,
    glassClass: 'glass-card-amber',
    shadowClass: 'shadow-float-amber',
    hue: 38,
  },
  'team': {
    ...existing,
    glassClass: 'glass-card-violet',
    shadowClass: 'shadow-float-violet',
    hue: 270,
  },
  'recruitment': {
    ...existing,
    glassClass: 'glass-card-rose',
    shadowClass: 'shadow-float-rose',
    hue: 345,
  },
} as const;
```

---

### Fase 5.3: UnifiedDashboard Dynamische Kleuren

**Bestand: `src/pages/UnifiedDashboard.tsx`**

Wrap elke TabsContent met de juiste context-kleur:

```tsx
{/* Tab 1: Mijn Werk */}
<TabsContent value="mijn-werk" className="mt-6">
  <div className={cn(
    "glass-layer-1 glass-light-bleed p-6 rounded-2xl space-y-6",
    getTabColors('mijn-werk').shadowClass // shadow-float-indigo
  )}>
    <div className="grid gap-6 md:grid-cols-2">
      <TodayFocusCard />
      <UpcomingRemindersWidget />
    </div>
    <MyTasksFlowSection />
  </div>
</TabsContent>

{/* Tab 5: Kalender */}
<TabsContent value="kalender" className="mt-6">
  <div className={cn(
    "glass-layer-1 glass-light-bleed p-6 rounded-2xl",
    getTabColors('kalender').shadowClass // shadow-float-teal
  )}>
    <EmbeddedCalendarView />
  </div>
</TabsContent>

// ... etc voor alle tabs
```

---

### Fase 5.4: Sidebar Glow Effect

**Bestand: `src/index.css`**

Voeg sidebar edge glow toe:

```css
/* Sidebar edge glow - reflects active context */
[data-sidebar="sidebar"] {
  position: relative;
}

[data-sidebar="sidebar"]::after {
  content: '';
  position: absolute;
  right: -1px;
  top: 20%;
  bottom: 20%;
  width: 2px;
  background: linear-gradient(
    180deg,
    transparent 0%,
    hsla(234, 45%, 52%, 0.2) 20%,
    hsla(234, 45%, 52%, 0.35) 50%,
    hsla(234, 45%, 52%, 0.2) 80%,
    transparent 100%
  );
  border-radius: 1px;
  pointer-events: none;
}

/* Dark mode variant */
.dark [data-sidebar="sidebar"]::after {
  background: linear-gradient(
    180deg,
    transparent 0%,
    hsla(234, 45%, 52%, 0.15) 20%,
    hsla(234, 45%, 52%, 0.25) 50%,
    hsla(234, 45%, 52%, 0.15) 80%,
    transparent 100%
  );
}
```

---

### Fase 5.5: Background Depth Enhancement

**Bestand: `src/index.css`**

Voeg subtiele depth toe aan de main content area:

```css
/* Main content area - subtle depth from sidebar */
.main-content-depth {
  position: relative;
}

.main-content-depth::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    hsla(234, 20%, 96%, 0.8) 0%,
    transparent 15%
  );
  pointer-events: none;
  z-index: -1;
}

.dark .main-content-depth::before {
  background: linear-gradient(
    90deg,
    hsla(234, 20%, 8%, 0.6) 0%,
    transparent 15%
  );
}
```

---

## Samenvatting Wijzigingen

| Bestand | Wijzigingen |
|---------|-------------|
| `src/index.css` | +80 regels (5 nieuwe shadow-float-*, 4 nieuwe glass-card-*, sidebar glow, main depth) |
| `src/lib/constants/designTokens.ts` | +18 regels (glassClass, shadowClass, hue per tab) |
| `src/pages/UnifiedDashboard.tsx` | Dynamische shadow classes per TabsContent |
| `src/components/ui/sidebar.tsx` | (Optioneel) Dynamic sidebar edge glow |

---

## Visueel Resultaat

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌─────────────┐ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  │             │ ░                                                       ░ │
│  │  SIDEBAR    │▓░  ╔═══════════════════════════════════════════════════╗░ │
│  │             │▓░  ║                                                   ║░ │
│  │  ○ Mijn Werk│▓░  ║   MIJN WERK TAB                                  ║░ │
│  │    Kalender │▓░  ║   Indigo shadow: hsla(234, 45%, 52%, 0.10)       ║░ │
│  │    Lijst    │▓░  ║                                                   ║░ │
│  │    Opvolging│▓░  ║   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓           ║░ │
│  │    Team     │▓░  ║   ▓ INDIGO GEKLEURDE SCHADUW                ▓    ║░ │
│  │    Recruit  │▓░  ║   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓           ║░ │
│  │             │▓░  ║                                                   ║░ │
│  │             │▓░  ╚═══════════════════════════════════════════════════╝░ │
│  │             │▓░                                                       ░ │
│  └─────────────┘ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│                  ↑                                                          │
│                  SIDEBAR GLOW (Indigo tint)                                 │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  BIJ WISSELEN NAAR KALENDER TAB:                                            │
│                                                                             │
│  ┌─────────────┐ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  │             │ ░                                                       ░ │
│  │  SIDEBAR    │▓░  ╔═══════════════════════════════════════════════════╗░ │
│  │             │▓░  ║                                                   ║░ │
│  │    Mijn Werk│▓░  ║   KALENDER TAB                                   ║░ │
│  │  ○ Kalender │▓░  ║   Teal shadow: hsla(174, 42%, 43%, 0.10)         ║░ │
│  │    Lijst    │▓░  ║                                                   ║░ │
│  │    Opvolging│▓░  ║   ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒           ║░ │
│  │    Team     │▓░  ║   ▒ TEAL GEKLEURDE SCHADUW                  ▒    ║░ │
│  │    Recruit  │▓░  ║   ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒           ║░ │
│  │             │▓░  ║                                                   ║░ │
│  │             │▓░  ╚═══════════════════════════════════════════════════╝░ │
│  │             │▓░                                                       ░ │
│  └─────────────┘ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│                  ↑                                                          │
│                  SIDEBAR GLOW (nu Teal tint)                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Expert Design Principes Toegepast

| Principe | Implementatie |
|----------|---------------|
| **Spatial Memory** | Kleur = locatie. Gebruiker herkent tab aan schaduwkleur |
| **Contextual Depth** | Schaduwen erven omgevingskleur (visionOS techniek) |
| **Visual Hierarchy** | Sidebar < Container < Cards (3 lagen diepte) |
| **Subtle Separation** | Sidebar glow creëert "floating" gevoel zonder harde border |
| **Consistent Language** | Elke tab heeft complete kleur-vocabulaire |

---

## Accessibility Behouden

| Aspect | Implementatie |
|--------|---------------|
| Contrast | Kleuren alleen voor decoratie, niet informatiedrager |
| Focus | Focus states onafhankelijk van context-kleur |
| Motion | Alle effecten zijn static (geen animatie) |
| Screen reader | Tab identiteit via tekst, niet kleur |

