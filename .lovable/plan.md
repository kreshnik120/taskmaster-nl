

# Fase 7: Zwevend Effect Versterking - Elk Element Loskomen van de Achtergrond

## Analyse van Screenshots - Probleemgebieden

Op basis van de screenshots identificeer ik de volgende elementen die nog geen premium "zwevend" glass effect hebben:

| Element | Huidige Status | Probleem |
|---------|---------------|----------|
| **Kanban kolom headers** | "Start.", "Actie uitgezet" | Platte tekst zonder glass container |
| **"Mijn Taken" section header** | Badge heeft indigo achtergrond maar mist diepte | Geen shadow, geen inner glow |
| **Zoekbalk** | Heeft basic glass maar mist shadow | Voelt "plat" aan |
| **"Nieuwe taak" button** | Heeft kleur maar mist premium glow | Geen floating effect |
| **"Team overzicht" button** | Outline variant heeft geen glass | Mist backdrop-blur |
| **Empty state "Geen taken"** | Icon bubble bestaat maar mist elevation | Geen colored shadow |
| **Scrollbar** | Standaard grijs | Geen glass treatment |
| **Select trigger (sorteer)** | Heeft glass maar geen indigo shadow | Niet consistent met context |
| **TaskCard in kolommen** | Heeft glass maar kan meer diepte | Extra elevation nodig |
| **Section headers (Basis informatie)** | Geen glass background | Plat, geen hover feedback |
| **Quick action buttons** | Timer/Herinnering missen premium feel | Geen inner glow |

---

## Technische Implementatie

### 1. Section Header "Mijn Taken" - Glass Badge Enhancement

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx`**

De huidige badge (regel 468-470) mist glassmorphism depth:

```tsx
// VOOR
<Badge className="ml-1 bg-tab-mijn-werk-100 text-tab-mijn-werk-700 border border-tab-mijn-werk-200 ...">

// NA - Enhanced met glass effect + shadow
<Badge 
  variant="glass" 
  className="ml-1 bg-tab-mijn-werk-100/70 text-tab-mijn-werk-700 
             border border-tab-mijn-werk-200/50 
             shadow-[0_2px_8px_hsla(234,45%,52%,0.12),inset_0_1px_1px_rgba(255,255,255,0.3)]
             backdrop-blur-sm
             dark:bg-tab-mijn-werk-900/50 dark:text-tab-mijn-werk-300 dark:border-tab-mijn-werk-700/30"
>
```

---

### 2. Search Input - Floating Effect

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx` (regel 534-544)**

Voeg indigo-tinted shadow toe aan zoekbalk:

```tsx
// NA - Enhanced met colored shadow + focus glow
<Input
  ref={searchInputRef}
  placeholder="Zoek taken... (/)"
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  className="h-8 pl-8 text-sm 
             bg-white/60 dark:bg-slate-900/60 
             backdrop-blur-md 
             border-tab-mijn-werk-200/50 dark:border-tab-mijn-werk-700/50 
             shadow-[0_2px_8px_hsla(234,45%,52%,0.06),inset_0_1px_1px_rgba(255,255,255,0.2)]
             focus:shadow-[0_4px_16px_hsla(234,45%,52%,0.15),0_0_0_3px_hsla(234,45%,52%,0.1)]
             focus:border-tab-mijn-werk-400
             transition-all duration-200"
  aria-label="Zoek in mijn taken"
/>
```

---

### 3. "Nieuwe taak" Button - Premium Glow

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx` (regel 547-550)**

```tsx
// NA - Gradient + colored glow
<Button 
  onClick={() => setTaskDialogOpen(true)} 
  size="sm" 
  className="gap-2 
             bg-gradient-to-b from-tab-mijn-werk-500 to-tab-mijn-werk-600 
             text-white 
             shadow-[0_2px_8px_hsla(234,45%,52%,0.30),inset_0_1px_1px_rgba(255,255,255,0.2)]
             hover:shadow-[0_4px_16px_hsla(234,45%,52%,0.40),inset_0_1px_2px_rgba(255,255,255,0.25)]
             hover:from-tab-mijn-werk-500 hover:to-tab-mijn-werk-550
             active:shadow-[0_1px_4px_hsla(234,45%,52%,0.20)]
             transition-all duration-200"
>
  <Plus className="h-4 w-4" />
  Nieuwe taak
</Button>
```

---

### 4. "Team overzicht" Button - Glass Outline Variant

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx` (regel 551-556)**

```tsx
// NA - Glass outline met subtle shadow
<Button 
  variant="outline" 
  size="sm" 
  className="gap-2 
             bg-white/50 dark:bg-slate-900/50 
             backdrop-blur-sm 
             border-white/40 dark:border-white/15
             shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.2)]
             hover:bg-white/70 dark:hover:bg-slate-800/70
             hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]
             transition-all duration-200"
  asChild
>
  <Link to="/kanban">
    Team overzicht
    <ArrowRight className="h-4 w-4" />
  </Link>
</Button>
```

---

### 5. Select Trigger - Indigo Context Shadow

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx` (regel 477-506)**

```tsx
// NA - Enhanced glass select met indigo shadow
<SelectTrigger className="h-8 w-[140px] text-xs 
                          bg-white/60 dark:bg-slate-900/60 
                          backdrop-blur-md 
                          border-tab-mijn-werk-200/50 dark:border-tab-mijn-werk-700/50
                          shadow-[0_2px_8px_hsla(234,45%,52%,0.06),inset_0_1px_1px_rgba(255,255,255,0.15)]
                          hover:shadow-[0_4px_12px_hsla(234,45%,52%,0.10)]
                          focus:shadow-[0_4px_16px_hsla(234,45%,52%,0.15),0_0_0_2px_hsla(234,45%,52%,0.1)]
                          transition-all duration-200">
```

---

### 6. Sort Direction Button - Glass Icon Button

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx` (regel 509-530)**

```tsx
// NA - Glass icon button
<Button
  variant="outline"
  size="icon"
  onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
  className="h-8 w-8 p-0 
             bg-white/50 dark:bg-slate-900/50 
             backdrop-blur-sm 
             border-white/40 dark:border-white/15
             shadow-[0_2px_6px_rgba(0,0,0,0.04)]
             hover:bg-white/70 dark:hover:bg-slate-800/70 
             hover:shadow-[0_4px_12px_hsla(234,45%,52%,0.08)]
             transition-all duration-200"
  aria-label={sortDirection === 'asc' ? 'Sorteer aflopend' : 'Sorteer oplopend'}
>
```

---

### 7. Empty State - Enhanced Glass Icon Bubble

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx` (regel 603-612)**

```tsx
// NA - Premium floating bubble met indigo glow
<div className="flex flex-col items-center justify-center py-8 text-center">
  <div className="p-4 rounded-2xl 
                  bg-white/60 dark:bg-slate-800/60 
                  backdrop-blur-md 
                  border border-white/40 dark:border-white/15
                  shadow-[0_4px_16px_hsla(234,45%,52%,0.10),0_8px_32px_hsla(234,45%,52%,0.06),inset_0_1px_1px_rgba(255,255,255,0.3)]
                  mb-3">
    <Inbox className="h-7 w-7 text-tab-mijn-werk-400/70 dark:text-tab-mijn-werk-500/70" />
  </div>
  <span className="text-xs text-muted-foreground/60 font-medium">
    Geen taken
  </span>
</div>
```

---

### 8. Kanban Column Headers - Glass Treatment

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx` (regel 591-598)**

De CardHeader mist premium glass styling:

```tsx
// NA - Enhanced header met glass gradient
<CardHeader className="pb-2 pt-3 px-3 
                        bg-gradient-to-b from-white/60 to-white/20 
                        dark:from-slate-800/60 dark:to-slate-800/20
                        backdrop-blur-sm
                        border-b border-white/30 dark:border-white/10
                        rounded-t-xl">
  <CardTitle className="text-sm font-medium flex items-center justify-between">
    <span className="truncate">{column.name}</span>
    <Badge 
      variant="glass" 
      className="ml-2 text-xs 
                 shadow-[0_1px_4px_hsla(234,45%,52%,0.08)]
                 bg-white/70 dark:bg-slate-800/70">
      {total}
    </Badge>
  </CardTitle>
</CardHeader>
```

---

### 9. Kanban Columns - Enhanced Floating

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx` (regel 590)**

```tsx
// NA - Deeper floating shadow voor kolommen
<Card className="h-full min-h-[200px] 
                glass-kanban-column 
                border-t-2 border-t-tab-mijn-werk-400/80 dark:border-t-tab-mijn-werk-600/80
                shadow-[0_4px_12px_hsla(234,45%,52%,0.08),0_12px_32px_hsla(234,45%,52%,0.06),0_24px_64px_hsla(234,45%,52%,0.04)]
                hover:shadow-[0_8px_24px_hsla(234,45%,52%,0.12),0_16px_48px_hsla(234,45%,52%,0.08)]
                transition-all duration-300">
```

---

### 10. ScrollBar - Glass Treatment

**Bestand: `src/components/ui/scroll-area.tsx` (regel 33)**

```tsx
// NA - Glass scrollbar thumb
<ScrollAreaPrimitive.ScrollAreaThumb 
  className="relative flex-1 rounded-full 
             bg-white/50 dark:bg-slate-600/50 
             backdrop-blur-sm 
             border border-white/30 dark:border-white/10
             shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]
             hover:bg-white/70 dark:hover:bg-slate-600/70
             transition-colors duration-200" 
/>
```

---

### 11. SelectTrigger Global Component - Glass Base

**Bestand: `src/components/ui/select.tsx` (regel 17-30)**

Update de globale SelectTrigger:

```tsx
<SelectPrimitive.Trigger
  ref={ref}
  className={cn(
    "flex h-10 w-full items-center justify-between rounded-lg 
     border border-white/30 dark:border-white/15 
     bg-white/50 dark:bg-slate-900/50 
     backdrop-blur-sm
     px-3 py-2 text-sm 
     ring-offset-background 
     shadow-[0_2px_6px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.15)]
     placeholder:text-muted-foreground 
     focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-2 
     focus:bg-white/70 dark:focus:bg-slate-900/70
     focus:shadow-[0_4px_12px_rgba(0,0,0,0.08)]
     disabled:cursor-not-allowed disabled:opacity-50 
     transition-all duration-200
     [&>span]:line-clamp-1",
    className,
  )}
  {...props}
>
```

---

### 12. Card Component - Enhanced Global Shadow

**Bestand: `src/components/ui/card.tsx` (regel 6)**

Versterk de globale Card shadow:

```tsx
// NA - Deeper multi-layer shadow
<div 
  ref={ref} 
  className={cn(
    "rounded-xl 
     border border-white/30 dark:border-white/10 
     bg-white/80 dark:bg-slate-900/80 
     backdrop-blur-md
     text-card-foreground 
     shadow-[0_2px_8px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06),inset_0_1px_1px_rgba(255,255,255,0.1)]
     hover:shadow-[0_4px_16px_rgba(0,0,0,0.08),0_12px_32px_rgba(0,0,0,0.08)]
     transition-all duration-300", 
    className
  )} 
  {...props} 
/>
```

---

### 13. CSS: Enhanced Glass Utilities

**Bestand: `src/index.css`**

Voeg nieuwe utility classes toe:

```css
/* ============================================
   ENHANCED FLOATING UTILITIES - Phase 7
   ============================================ */

/* Floating search input */
.glass-search-input {
  background: rgba(255, 255, 255, 0.60);
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.35);
  box-shadow: 
    0 2px 8px hsla(234, 45%, 52%, 0.06),
    inset 0 1px 1px rgba(255, 255, 255, 0.25);
  transition: all 0.2s ease-out;
}

.glass-search-input:focus {
  background: rgba(255, 255, 255, 0.75);
  box-shadow: 
    0 4px 16px hsla(234, 45%, 52%, 0.15),
    0 0 0 3px hsla(234, 45%, 52%, 0.08),
    inset 0 1px 2px rgba(255, 255, 255, 0.3);
}

.dark .glass-search-input {
  background: rgba(30, 41, 59, 0.60);
  border-color: rgba(255, 255, 255, 0.15);
}

.dark .glass-search-input:focus {
  background: rgba(30, 41, 59, 0.75);
}

/* Floating badge with colored shadow */
.glass-badge-indigo {
  background: hsla(234, 45%, 97%, 0.70);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid hsla(234, 45%, 88%, 0.50);
  box-shadow: 
    0 2px 8px hsla(234, 45%, 52%, 0.10),
    inset 0 1px 1px rgba(255, 255, 255, 0.3);
}

.dark .glass-badge-indigo {
  background: hsla(234, 45%, 26%, 0.50);
  border-color: hsla(234, 45%, 40%, 0.35);
  box-shadow: 
    0 2px 8px hsla(234, 45%, 15%, 0.25),
    inset 0 1px 1px hsla(234, 45%, 52%, 0.1);
}

/* Premium primary button */
.btn-premium-primary {
  background: linear-gradient(180deg, hsl(234, 45%, 52%) 0%, hsl(234, 45%, 46%) 100%);
  color: white;
  box-shadow: 
    0 2px 8px hsla(234, 45%, 52%, 0.30),
    inset 0 1px 1px rgba(255, 255, 255, 0.20);
  transition: all 0.2s ease-out;
}

.btn-premium-primary:hover {
  background: linear-gradient(180deg, hsl(234, 45%, 54%) 0%, hsl(234, 45%, 48%) 100%);
  box-shadow: 
    0 4px 16px hsla(234, 45%, 52%, 0.40),
    inset 0 1px 2px rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}

.btn-premium-primary:active {
  box-shadow: 
    0 1px 4px hsla(234, 45%, 52%, 0.20);
  transform: translateY(0);
}

/* Glass outline button */
.btn-glass-outline {
  background: rgba(255, 255, 255, 0.50);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.40);
  box-shadow: 
    0 2px 8px rgba(0, 0, 0, 0.04),
    inset 0 1px 1px rgba(255, 255, 255, 0.20);
  transition: all 0.2s ease-out;
}

.btn-glass-outline:hover {
  background: rgba(255, 255, 255, 0.70);
  box-shadow: 
    0 4px 12px rgba(0, 0, 0, 0.08),
    inset 0 1px 2px rgba(255, 255, 255, 0.25);
}

.dark .btn-glass-outline {
  background: rgba(30, 41, 59, 0.50);
  border-color: rgba(255, 255, 255, 0.15);
}

.dark .btn-glass-outline:hover {
  background: rgba(30, 41, 59, 0.70);
}

/* Enhanced empty state bubble */
.glass-empty-bubble {
  background: rgba(255, 255, 255, 0.60);
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.40);
  box-shadow: 
    0 4px 16px hsla(234, 45%, 52%, 0.10),
    0 8px 32px hsla(234, 45%, 52%, 0.06),
    inset 0 1px 2px rgba(255, 255, 255, 0.30);
}

.dark .glass-empty-bubble {
  background: rgba(30, 41, 59, 0.60);
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow: 
    0 4px 16px hsla(234, 45%, 15%, 0.25),
    0 8px 32px hsla(234, 45%, 10%, 0.20),
    inset 0 1px 2px hsla(234, 45%, 52%, 0.1);
}

/* Glass scrollbar */
.glass-scrollbar::-webkit-scrollbar {
  width: 10px;
}

.glass-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.glass-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.50);
  backdrop-filter: blur(4px);
  border: 2px solid transparent;
  background-clip: padding-box;
  border-radius: 10px;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.2);
}

.glass-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.70);
  background-clip: padding-box;
}

.dark .glass-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(100, 116, 139, 0.50);
  background-clip: padding-box;
}

.dark .glass-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(100, 116, 139, 0.70);
  background-clip: padding-box;
}

/* Kanban column enhanced */
.glass-kanban-column-enhanced {
  position: relative;
  overflow: hidden;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.35);
  box-shadow: 
    0 4px 12px hsla(234, 45%, 52%, 0.08),
    0 12px 32px hsla(234, 45%, 52%, 0.06),
    0 24px 64px hsla(234, 45%, 52%, 0.04),
    inset 0 1px 1px rgba(255, 255, 255, 0.15);
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.glass-kanban-column-enhanced:hover {
  box-shadow: 
    0 8px 24px hsla(234, 45%, 52%, 0.12),
    0 16px 48px hsla(234, 45%, 52%, 0.08),
    0 32px 80px hsla(234, 45%, 52%, 0.04),
    inset 0 1px 2px rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.dark .glass-kanban-column-enhanced {
  background: rgba(30, 41, 59, 0.55);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 
    0 4px 12px hsla(234, 45%, 15%, 0.25),
    0 12px 32px hsla(234, 45%, 10%, 0.20),
    0 24px 64px hsla(234, 45%, 8%, 0.15),
    inset 0 1px 1px rgba(255, 255, 255, 0.05);
}
```

---

## Samenvatting Wijzigingen

| Bestand | Wijzigingen |
|---------|-------------|
| `src/index.css` | +100 regels (glass-search-input, glass-badge-indigo, btn-premium-primary, btn-glass-outline, glass-empty-bubble, glass-scrollbar, glass-kanban-column-enhanced) |
| `src/components/dashboard/MyTasksFlowSection.tsx` | 8 component updates (badge, search, buttons, select, empty state, column headers, columns) |
| `src/components/ui/scroll-area.tsx` | Glass scrollbar thumb styling |
| `src/components/ui/select.tsx` | Glass SelectTrigger base styling |
| `src/components/ui/card.tsx` | Enhanced global Card shadow + inner glow |

**Totaal: ~5 bestanden, ~150+ klassen/regels**

---

## Visueel Resultaat

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  VOOR: Elementen liggen "plat" op de achtergrond                        │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ [Mijn Taken] (5 taken)  [Zoek...]  [+ Nieuwe taak] [Team →]     │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Start. (4)  │ Actie (0)  │ Afwachten (0) │ In afwachting (0)   │   │
│  │  ┌─────────┐ │ ┌────────┐ │ ┌───────────┐ │ ┌───────────────┐   │   │
│  │  │ Taak... │ │ │ (leeg) │ │ │  (leeg)   │ │ │    (leeg)     │   │   │
│  │  └─────────┘ │ └────────┘ │ └───────────┘ │ └───────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  NA: Elk element ZWEEFT met gekleurde schaduwen                         │
│                                                                         │
│  ╔══════════════════════════════════════════════════════════════════╗   │
│  ║                                                                  ║   │
│  ║  ┌───────────────────────────────────────────────────────────┐   ║   │
│  ║  │▒ Mijn Taken ▒│░5 taken░│  ╔═══════════╗  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓   │   ║   │
│  ║  │   glass      │ badge   │  ║ Zoek...   ║  ▓ + Nieuwe  ▓    │   ║   │
│  ║  │   header     │ + glow  │  ║ + shadow  ║  ▓   taak    ▓    │   ║   │
│  ║  │              │         │  ╚═══════════╝  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓   │   ║   │
│  ║  └───────────────────────────────────────────────────────────┘   ║   │
│  ║                                                                  ║   │
│  ║  ╔════════════╗ ╔════════════╗ ╔════════════╗ ╔════════════╗     ║   │
│  ║  ║ Start. (4) ║ ║ Actie (0)  ║ ║ Afwach (0) ║ ║ In afw (0) ║     ║   │
│  ║  ║ ▓▓▓▓▓▓▓▓▓▓ ║ ║            ║ ║            ║ ║            ║     ║   │
│  ║  ║ ▓ Taak... ▓║ ║   ╔════╗   ║ ║   ╔════╗   ║ ║   ╔════╗   ║     ║   │
│  ║  ║ ▓ + shadow ▓║ ║   ║ 📥 ║   ║ ║   ║ 📥 ║   ║ ║   ║ 📥 ║   ║     ║   │
│  ║  ║ ▓▓▓▓▓▓▓▓▓▓ ║ ║   ║glow║   ║ ║   ║glow║   ║ ║   ║glow║   ║     ║   │
│  ║  ║            ║ ║   ╚════╝   ║ ║   ╚════╝   ║ ║   ╚════╝   ║     ║   │
│  ║  ╚════════════╝ ╚════════════╝ ╚════════════╝ ╚════════════╝     ║   │
│  ║  ▒▒▒▒▒ INDIGO SHADOWS - FLOATING EFFECT ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒      ║   │
│  ║                                                                  ║   │
│  ╚══════════════════════════════════════════════════════════════════╝   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Expert Design Principes

| Principe | Implementatie |
|----------|---------------|
| **Elevation Hierarchy** | Buttons > Inputs > Badges > Container (progressieve diepte) |
| **Contextual Shadows** | Alle schaduwen gebruiken `hsla(234, 45%, 52%)` (Indigo context) |
| **Inner Glow** | `inset 0 1px 1px rgba(255,255,255,0.2)` voor frosted edge |
| **Multi-layer Depth** | 3+ shadow layers voor premium floating effect |
| **Micro-hover** | `translateY(-1px)` + shadow grow bij hover |
| **Consistent Blur** | `backdrop-blur-md` (12px) voor glass coherentie |

