

# Fase 16: Design System Unificatie — Complete Glassmorphism Consistentie

## Executive Summary

Als specialist in enterprise UI/UX design heb ik een **grondige audit** uitgevoerd van alle 25+ UI primitives. Hoewel Fase 14-15 significante verbeteringen hebben gebracht, bestaan er nog **kritieke inconsistenties** die de visionOS-esthetiek ondermijnen. Dit plan unificeert het volledige design system naar één coherent glassmorphism framework.

---

## Audit Resultaten: Consistentie Matrix

| Component | Container Glass | Item Glass | Separator | Focus State | Status |
|-----------|-----------------|------------|-----------|-------------|--------|
| **Dialog** | `bg-white/85 blur-2xl` | - | - | `rounded-sm` | Partial |
| **AlertDialog** | `bg-white/90 blur-2xl` | - | - | - | OK |
| **Sheet** | `bg-white/90 blur-xl` | - | - | - | OK |
| **Select** | `bg-white/90 blur-xl` | Glass | `bg-muted` | Glass | Partial |
| **DropdownMenu** | `bg-white/90 blur-xl` | Glass | `bg-muted` | Glass | Partial |
| **ContextMenu** | `bg-white/90 blur-xl` | Glass | - | Glass | OK |
| **Popover** | `bg-white/90 blur-xl` | - | - | - | OK |
| **Tooltip** | `bg-white/95 blur-xl` | - | - | - | OK |
| **HoverCard** | `bg-white/90 blur-xl` | - | - | - | OK |
| **Menubar** | `bg-background` | Geen | `bg-muted` | `bg-accent` | FAIL |
| **NavigationMenu** | `bg-popover` | - | - | `bg-accent` | FAIL |
| **Accordion** | Geen | `border-b` | - | `underline` | FAIL |
| **Separator** | - | - | `bg-border` | - | Partial |

---

## Geïdentificeerde Kritieke Gaps

### Categorie A: Volledig Ontbreken van Glass (Prioriteit 1)

| # | Component | Huidige Status | Impact |
|---|-----------|----------------|--------|
| 1 | **Menubar** (Root) | `bg-background border` | Hoog - geen blur |
| 2 | **MenubarContent** | `bg-popover shadow-md` | Hoog - geen blur |
| 3 | **MenubarItem** | `focus:bg-accent` | Medium - geen glass focus |
| 4 | **NavigationMenuViewport** | `bg-popover shadow-lg` | Hoog - geen blur |
| 5 | **NavigationMenuTrigger** | `bg-background` | Medium - geen glass hover |

### Categorie B: Inconsistente Subcomponenten (Prioriteit 2)

| # | Component | Huidige Status | Correctie |
|---|-----------|----------------|-----------|
| 6 | **DropdownMenuSubContent** | `bg-popover border` | Naar glass container |
| 7 | **DropdownMenuSubTrigger** | `focus:bg-accent` | Naar glass focus |
| 8 | **DropdownMenuCheckboxItem** | `focus:bg-accent` | Naar glass focus |
| 9 | **DropdownMenuRadioItem** | `focus:bg-accent` | Naar glass focus |
| 10 | **MenubarSubContent** | `bg-popover border` | Naar glass container |
| 11 | **MenubarCheckboxItem** | `focus:bg-accent` | Naar glass focus |
| 12 | **MenubarRadioItem** | `focus:bg-accent` | Naar glass focus |

### Categorie C: Separator & Detail Inconsistenties (Prioriteit 3)

| # | Component | Huidige Status | Correctie |
|---|-----------|----------------|-----------|
| 13 | **DropdownMenuSeparator** | `bg-muted` | Naar `bg-white/20` |
| 14 | **SelectSeparator** | `bg-muted` | Naar `bg-white/20` |
| 15 | **MenubarSeparator** | `bg-muted` | Naar `bg-white/20` |
| 16 | **Separator** (global) | `bg-border` | Naar semi-transparent |
| 17 | **DialogClose button** | `rounded-sm` | Naar `rounded-lg` + glass hover |
| 18 | **AccordionItem** | `border-b` | Naar glass separator |
| 19 | **AccordionTrigger** | `hover:underline` | Naar glass hover |

---

## Implementatieplan

### Deel 1: Menubar — Complete Glass Upgrade

**Bestand:** `src/components/ui/menubar.tsx`

**1.1 Menubar Root (regels 17-26)**

```tsx
const Menubar = React.forwardRef<...>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Root
    ref={ref}
    className={cn(
      "flex h-10 items-center space-x-1 rounded-xl p-1",
      "bg-white/60 dark:bg-slate-900/60 backdrop-blur-md",
      "border border-white/30 dark:border-white/15",
      "shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.1)]",
      className
    )}
    {...props}
  />
));
```

**1.2 MenubarTrigger (regels 29-41)**

```tsx
className={cn(
  "flex cursor-default select-none items-center rounded-lg px-3 py-1.5 text-sm font-medium outline-none transition-all duration-200",
  "data-[state=open]:bg-white/60 dark:data-[state=open]:bg-slate-800/60",
  "focus:bg-white/50 dark:focus:bg-slate-800/50",
  "hover:bg-white/40 dark:hover:bg-slate-800/40",
  className,
)}
```

**1.3 MenubarContent (regels 80-97)**

```tsx
className={cn(
  "z-50 min-w-[12rem] overflow-hidden rounded-xl p-1 text-popover-foreground",
  "bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl",
  "border border-white/30 dark:border-white/15",
  "shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15),0_4px_16px_rgba(0,0,0,0.1)]",
  "data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
  className,
)}
```

**1.4 MenubarSubContent (regels 65-77)**

```tsx
className={cn(
  "z-50 min-w-[8rem] overflow-hidden rounded-xl p-1 text-popover-foreground",
  "bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl",
  "border border-white/30 dark:border-white/15",
  "shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15),0_4px_16px_rgba(0,0,0,0.1)]",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
  className,
)}
```

**1.5 MenubarItem (regels 100-115)**

```tsx
className={cn(
  "relative flex cursor-default select-none items-center rounded-lg px-2 py-1.5 text-sm outline-none transition-colors",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "focus:bg-white/50 dark:focus:bg-slate-800/50 focus:backdrop-blur-sm",
  inset && "pl-8",
  className,
)}
```

**1.6 MenubarSubTrigger (regels 44-62)**

```tsx
className={cn(
  "flex cursor-default select-none items-center rounded-lg px-2 py-1.5 text-sm outline-none transition-colors",
  "data-[state=open]:bg-white/50 dark:data-[state=open]:bg-slate-800/50",
  "focus:bg-white/50 dark:focus:bg-slate-800/50 focus:backdrop-blur-sm",
  inset && "pl-8",
  className,
)}
```

**1.7 MenubarCheckboxItem (regels 118-138)**

```tsx
className={cn(
  "relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm outline-none transition-colors",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "focus:bg-white/50 dark:focus:bg-slate-800/50 focus:backdrop-blur-sm",
  className,
)}
```

**1.8 MenubarRadioItem (regels 141-160)**

```tsx
className={cn(
  "relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm outline-none transition-colors",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "focus:bg-white/50 dark:focus:bg-slate-800/50 focus:backdrop-blur-sm",
  className,
)}
```

**1.9 MenubarSeparator (regels 177-181)**

```tsx
className={cn("-mx-1 my-1 h-px bg-white/20 dark:bg-white/10", className)}
```

---

### Deel 2: DropdownMenu — Subcomponent Glass Upgrade

**Bestand:** `src/components/ui/dropdown-menu.tsx`

**2.1 DropdownMenuSubContent (regels 40-52)**

```tsx
className={cn(
  "z-50 min-w-[8rem] overflow-hidden rounded-xl p-1 text-popover-foreground",
  "bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl",
  "border border-white/30 dark:border-white/15",
  "shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15),0_4px_16px_rgba(0,0,0,0.1)]",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
  className,
)}
```

**2.2 DropdownMenuSubTrigger (regels 19-37)**

```tsx
className={cn(
  "flex cursor-default select-none items-center rounded-lg px-2 py-1.5 text-sm outline-none transition-colors",
  "data-[state=open]:bg-white/50 dark:data-[state=open]:bg-slate-800/50",
  "focus:bg-white/50 dark:focus:bg-slate-800/50 focus:backdrop-blur-sm",
  inset && "pl-8",
  className,
)}
```

**2.3 DropdownMenuCheckboxItem (regels 91-111)**

```tsx
className={cn(
  "relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm outline-none transition-colors",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "focus:bg-white/50 dark:focus:bg-slate-800/50 focus:backdrop-blur-sm",
  className,
)}
```

**2.4 DropdownMenuRadioItem (regels 114-133)**

```tsx
className={cn(
  "relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm outline-none transition-colors",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "focus:bg-white/50 dark:focus:bg-slate-800/50 focus:backdrop-blur-sm",
  className,
)}
```

**2.5 DropdownMenuSeparator (regels 150-155)**

```tsx
className={cn("-mx-1 my-1 h-px bg-white/20 dark:bg-white/10", className)}
```

---

### Deel 3: NavigationMenu — Glass Upgrade

**Bestand:** `src/components/ui/navigation-menu.tsx`

**3.1 navigationMenuTriggerStyle (regels 37-39)**

```tsx
const navigationMenuTriggerStyle = cva(
  "group inline-flex h-10 w-max items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 focus:outline-none disabled:pointer-events-none disabled:opacity-50",
  "bg-transparent",
  "hover:bg-white/50 dark:hover:bg-slate-800/50",
  "focus:bg-white/50 dark:focus:bg-slate-800/50",
  "data-[active]:bg-white/60 dark:data-[active]:bg-slate-800/60",
  "data-[state=open]:bg-white/60 dark:data-[state=open]:bg-slate-800/60",
);
```

**3.2 NavigationMenuViewport (regels 76-90)**

```tsx
className={cn(
  "origin-top-center relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden rounded-xl md:w-[var(--radix-navigation-menu-viewport-width)]",
  "bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl",
  "border border-white/30 dark:border-white/15",
  "shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15),0_4px_16px_rgba(0,0,0,0.1)]",
  "text-popover-foreground",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90",
  className,
)}
```

---

### Deel 4: Select — Separator Fix

**Bestand:** `src/components/ui/select.tsx`

**4.1 SelectSeparator (regels 124-129)**

```tsx
className={cn("-mx-1 my-1 h-px bg-white/20 dark:bg-white/10", className)}
```

---

### Deel 5: Dialog — Close Button Upgrade

**Bestand:** `src/components/ui/dialog.tsx`

**5.1 DialogClose button (regel 45)**

```tsx
<DialogPrimitive.Close className="absolute right-4 top-4 rounded-lg p-1 opacity-70 ring-offset-background transition-all duration-200 hover:bg-white/50 dark:hover:bg-slate-800/50 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
```

---

### Deel 6: Separator — Global Glass Upgrade

**Bestand:** `src/components/ui/separator.tsx`

**6.1 Separator (regels 6-17)**

```tsx
className={cn(
  "shrink-0",
  "bg-white/20 dark:bg-white/10",
  orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
  className
)}
```

---

### Deel 7: Accordion — Glass Treatment

**Bestand:** `src/components/ui/accordion.tsx`

**7.1 AccordionItem (regels 9-14)**

```tsx
className={cn(
  "border-b border-white/20 dark:border-white/10",
  className
)}
```

**7.2 AccordionTrigger (regels 17-34)**

```tsx
className={cn(
  "flex flex-1 items-center justify-between py-4 font-medium transition-all duration-200 [&[data-state=open]>svg]:rotate-180",
  "rounded-lg px-2 -mx-2",
  "hover:bg-white/40 dark:hover:bg-slate-800/40",
  className,
)}
```

---

## Samenvatting Wijzigingen

| Bestand | Componenten | Wijzigingen |
|---------|-------------|-------------|
| `menubar.tsx` | 9 componenten | Root, Content, SubContent, Trigger, SubTrigger, Item, CheckboxItem, RadioItem, Separator |
| `dropdown-menu.tsx` | 5 componenten | SubContent, SubTrigger, CheckboxItem, RadioItem, Separator |
| `navigation-menu.tsx` | 2 componenten | TriggerStyle, Viewport |
| `select.tsx` | 1 component | Separator |
| `dialog.tsx` | 1 component | Close button |
| `separator.tsx` | 1 component | Root |
| `accordion.tsx` | 2 componenten | Item, Trigger |

**Totaal: 21 component upgrades**

---

## Design System Standaarden (Geünificeerd)

### Glass Containers (Floating Elements)

```css
/* Standaard voor alle floating content */
bg-white/90 dark:bg-slate-900/90 
backdrop-blur-xl 
border border-white/30 dark:border-white/15
shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15),0_4px_16px_rgba(0,0,0,0.1)]
rounded-xl
```

### Glass Focus States

```css
/* Standaard voor alle focusable items */
focus:bg-white/50 dark:focus:bg-slate-800/50 
focus:backdrop-blur-sm
rounded-lg
transition-colors
```

### Glass Separators

```css
/* Standaard voor alle separators */
bg-white/20 dark:bg-white/10
h-[1px]
```

### Glass Hover States (Non-DnD)

```css
/* Standaard voor hover states */
hover:bg-white/40 dark:hover:bg-slate-800/40
transition-all duration-200
```

---

## Visueel Resultaat

```text
┌──────────────────────────────────────────────────────────────┐
│  UNIFIED GLASSMORPHISM DESIGN SYSTEM                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  📋 MENUBAR (Glass Root)                                │ │
│  │  ░░░ bg-white/60 backdrop-blur-md ░░░                   │ │
│  │  [File ▼]  [Edit ▼]  [View ▼]  [Help ▼]                 │ │
│  │                                                         │ │
│  │  ┌───────────────┐                                      │ │
│  │  │ Glass Dropdown│  (bg-white/90 blur-xl)               │ │
│  │  │ ─────────────│   (separator: bg-white/20)           │ │
│  │  │ ☑ Option A   │   (focus: bg-white/50)               │ │
│  │  │ ○ Option B   │                                       │ │
│  │  └───────────────┘                                      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  🧭 NAVIGATION MENU                                     │ │
│  │  [Products ▼] [Solutions ▼] [Resources ▼]               │ │
│  │       │                                                 │ │
│  │       ▼ Glass Viewport (bg-white/90 blur-xl)            │ │
│  │  ┌────────────────────────────────────────┐             │ │
│  │  │  ░░░ Premium content area ░░░          │             │ │
│  │  └────────────────────────────────────────┘             │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  📂 ACCORDION                                           │ │
│  │  ┌─────────────────────────────────────────────────────┐ │
│  │  │  ▶ Section 1              (hover: bg-white/40)      │ │
│  │  │────────────────────────── (border: bg-white/20)     │ │
│  │  │  ▼ Section 2 (open)                                 │ │
│  │  │    Content with glass hover                         │ │
│  │  │────────────────────────── (glass separator)         │ │
│  │  │  ▶ Section 3                                        │ │
│  │  └─────────────────────────────────────────────────────┘ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Acceptatiecriteria

1. Menubar root heeft glass styling met `backdrop-blur-md`
2. MenubarContent/SubContent hebben premium glass met `backdrop-blur-xl`
3. Alle Menubar items hebben glass focus states
4. NavigationMenuViewport heeft glass container
5. NavigationMenuTrigger heeft glass hover/active states
6. DropdownMenu subcomponenten (SubContent, SubTrigger, CheckboxItem, RadioItem) hebben glass styling
7. Alle Separator componenten gebruiken `bg-white/20 dark:bg-white/10`
8. Dialog close button heeft glass hover en `rounded-lg`
9. Accordion items hebben glass borders en hover states
10. Volledige dark mode compatibiliteit
11. Alle animaties en transitions blijven intact
12. Geen visuele regressies in bestaande componenten

---

## Expert Validatie Checklist

Na implementatie valideren:

- [ ] Menubar dropdown menu's openen correct met glass styling
- [ ] NavigationMenu viewport toont glass container
- [ ] Checkbox/Radio items in dropdowns tonen glass focus
- [ ] Separators zijn subtiel zichtbaar in light en dark mode
- [ ] Dialog close button hover heeft glass effect
- [ ] Accordion items hebben smooth hover transitions
- [ ] Geen z-index conflicten tussen floating elements
- [ ] Performance impact van extra blur effecten is acceptabel

