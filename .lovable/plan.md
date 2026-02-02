

# Fase 15: Final Glass Polish — UI Primitives & Toast Notifications

## Executive Summary

Na analyse van alle UI componenten zijn er nog **8 specifieke primitives** die geen glassmorphism hebben, terwijl vergelijkbare componenten (Dialog, DropdownMenu, Select, AlertDialog) al wel zijn geüpgraded. Dit plan brengt volledige visuele consistentie.

---

## Geïdentificeerde Gaps

| # | Component | Huidige Status | Probleem |
|---|-----------|----------------|----------|
| 1 | `sonner.tsx` (Toaster) | `bg-background shadow-lg` | Geen glass styling |
| 2 | `popover.tsx` | `bg-popover shadow-md` | Geen glass/blur |
| 3 | `context-menu.tsx` | `bg-popover shadow-md` | Geen glass styling |
| 4 | `tooltip.tsx` | `bg-popover shadow-md` | Geen glass/blur |
| 5 | `hover-card.tsx` | `bg-popover shadow-md` | Geen glass styling |
| 6 | `sheet.tsx` | `bg-background` | Geen glass panel |
| 7 | `skeleton.tsx` | `bg-muted` | Geen glass shimmer |
| 8 | `TaskListEmptyState.tsx` | Geen container styling | Geen glass empty state |

---

## Prioriteit 1: Sonner Toaster — Glass Toast Notifications

**Bestand:** `src/components/ui/sonner.tsx`

**Probleem:** Toast notifications gebruiken standaard `bg-background` zonder glassmorphism.

**Oplossing:** Voeg premium glass styling toe aan toast notifications.

**Wijzigingen:**

```tsx
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white/90 dark:group-[.toaster]:bg-slate-900/90 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-foreground group-[.toaster]:border-white/40 dark:group-[.toaster]:border-white/15 group-[.toaster]:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15),0_4px_16px_rgba(0,0,0,0.1)] group-[.toaster]:rounded-xl",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:shadow-[0_2px_8px_hsla(221,83%,53%,0.25)]",
          cancelButton: "group-[.toast]:bg-white/60 dark:group-[.toast]:bg-slate-800/60 group-[.toast]:backdrop-blur-sm group-[.toast]:text-muted-foreground group-[.toast]:border-white/30",
          success: "group-[.toaster]:border-green-500/30 group-[.toaster]:shadow-[0_10px_40px_-10px_hsla(142,71%,45%,0.15),0_4px_16px_hsla(142,71%,45%,0.1)]",
          error: "group-[.toaster]:border-destructive/30 group-[.toaster]:shadow-[0_10px_40px_-10px_hsla(0,84%,60%,0.15),0_4px_16px_hsla(0,84%,60%,0.1)]",
          warning: "group-[.toaster]:border-orange-500/30 group-[.toaster]:shadow-[0_10px_40px_-10px_hsla(24,95%,53%,0.15),0_4px_16px_hsla(24,95%,53%,0.1)]",
          info: "group-[.toaster]:border-primary/30 group-[.toaster]:shadow-[0_10px_40px_-10px_hsla(221,83%,53%,0.15),0_4px_16px_hsla(221,83%,53%,0.1)]",
        },
      }}
      {...props}
    />
  );
};
```

---

## Prioriteit 2: Popover — Glass Floating Panel

**Bestand:** `src/components/ui/popover.tsx`

**Probleem:** Popover content heeft standaard styling zonder glassmorphism.

**Oplossing:** Voeg glass styling toe consistent met DropdownMenu.

**Wijzigingen:**

```tsx
<PopoverPrimitive.Content
  ref={ref}
  align={align}
  sideOffset={sideOffset}
  className={cn(
    "z-50 w-72 rounded-xl p-4 text-popover-foreground outline-none",
    "bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl",
    "border border-white/30 dark:border-white/15",
    "shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15),0_4px_16px_rgba(0,0,0,0.1)]",
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
    className,
  )}
  {...props}
/>
```

---

## Prioriteit 3: Context Menu — Glass Right-Click Menu

**Bestand:** `src/components/ui/context-menu.tsx`

**Probleem:** Context menu heeft standaard styling zonder glassmorphism.

**Oplossing:** Voeg glass styling toe aan ContextMenuContent en ContextMenuSubContent.

**Wijzigingen ContextMenuContent:**

```tsx
<ContextMenuPrimitive.Content
  ref={ref}
  className={cn(
    "z-50 min-w-[8rem] overflow-hidden rounded-xl p-1 text-popover-foreground",
    "bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl",
    "border border-white/30 dark:border-white/15",
    "shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15),0_4px_16px_rgba(0,0,0,0.1)]",
    "animate-in fade-in-80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
    className,
  )}
  {...props}
/>
```

**Wijzigingen ContextMenuSubContent (zelfde styling).**

**Wijzigingen ContextMenuItem:**

```tsx
className={cn(
  "relative flex cursor-default select-none items-center rounded-lg px-2 py-1.5 text-sm outline-none transition-colors",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "focus:bg-white/50 dark:focus:bg-slate-800/50 focus:backdrop-blur-sm",
  inset && "pl-8",
  className,
)}
```

---

## Prioriteit 4: Tooltip — Glass Tooltip

**Bestand:** `src/components/ui/tooltip.tsx`

**Probleem:** Tooltips hebben standaard styling zonder glassmorphism.

**Oplossing:** Voeg subtiele glass styling toe.

**Wijzigingen:**

```tsx
<TooltipPrimitive.Content
  ref={ref}
  sideOffset={sideOffset}
  className={cn(
    "z-50 overflow-hidden rounded-lg px-3 py-1.5 text-sm",
    "bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl",
    "text-popover-foreground",
    "border border-white/30 dark:border-white/15",
    "shadow-[0_4px_16px_rgba(0,0,0,0.1),0_2px_6px_rgba(0,0,0,0.06)]",
    "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
    className,
  )}
  {...props}
/>
```

---

## Prioriteit 5: HoverCard — Glass Hover Panel

**Bestand:** `src/components/ui/hover-card.tsx`

**Probleem:** HoverCard content heeft standaard styling.

**Oplossing:** Voeg glass styling toe.

**Wijzigingen:**

```tsx
<HoverCardPrimitive.Content
  ref={ref}
  align={align}
  sideOffset={sideOffset}
  className={cn(
    "z-50 w-64 rounded-xl p-4 text-popover-foreground outline-none",
    "bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl",
    "border border-white/30 dark:border-white/15",
    "shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15),0_4px_16px_rgba(0,0,0,0.1)]",
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
    className,
  )}
  {...props}
/>
```

---

## Prioriteit 6: Sheet — Glass Side Panel

**Bestand:** `src/components/ui/sheet.tsx`

**Probleem:** Sheet overlay en content hebben geen glassmorphism.

**Oplossing:** Voeg glass styling toe aan overlay en content.

**Wijzigingen SheetOverlay:**

```tsx
className={cn(
  "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  className,
)}
```

**Wijzigingen sheetVariants:**

```tsx
const sheetVariants = cva(
  "fixed z-50 gap-4 p-6 transition ease-in-out bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-white/40 dark:border-white/15 shadow-[0_0_60px_hsla(215,25%,48%,0.15),-10px_0_40px_hsla(215,25%,48%,0.08)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        // ... zelfde als voorheen met border-t/b/l/r behouden
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);
```

---

## Prioriteit 7: Skeleton — Glass Shimmer Effect

**Bestand:** `src/components/ui/skeleton.tsx`

**Probleem:** Skeleton heeft eenvoudige `bg-muted` zonder glass effect.

**Oplossing:** Voeg glass shimmer toe.

**Wijzigingen:**

```tsx
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div 
      className={cn(
        "animate-pulse rounded-md",
        "bg-white/40 dark:bg-slate-800/40",
        "backdrop-blur-sm",
        "border border-white/20 dark:border-white/8",
        className
      )} 
      {...props} 
    />
  );
}
```

---

## Prioriteit 8: TaskListEmptyState — Glass Empty State

**Bestand:** `src/components/TaskListView/TaskListEmptyState.tsx`

**Probleem:** Empty state heeft geen container styling.

**Oplossing:** Voeg glass container toe.

**Wijzigingen:**

```tsx
export function TaskListEmptyState({ filtered = false }: TaskListEmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-12 px-8 text-center",
      "rounded-xl",
      "bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm",
      "border border-white/30 dark:border-white/12",
      "shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
    )}>
      {filtered ? (
        <>
          <div className="p-4 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm mb-4">
            <Search className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">
            Geen taken gevonden voor deze zoekopdracht
          </h3>
          <p className="text-sm text-muted-foreground">
            Probeer andere zoektermen of verwijder filters
          </p>
        </>
      ) : (
        <>
          <div className="p-4 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm mb-4">
            <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">
            Geen taken gevonden
          </h3>
          <p className="text-sm text-muted-foreground">
            Er zijn momenteel geen actieve taken
          </p>
        </>
      )}
    </div>
  );
}
```

---

## Samenvatting Bestanden

| Bestand | Wijzigingen |
|---------|-------------|
| `src/components/ui/sonner.tsx` | Glass toast styling + context shadows |
| `src/components/ui/popover.tsx` | Glass content panel |
| `src/components/ui/context-menu.tsx` | Glass menu + items |
| `src/components/ui/tooltip.tsx` | Glass tooltip |
| `src/components/ui/hover-card.tsx` | Glass hover panel |
| `src/components/ui/sheet.tsx` | Glass overlay + panel |
| `src/components/ui/skeleton.tsx` | Glass shimmer effect |
| `src/components/TaskListView/TaskListEmptyState.tsx` | Glass empty state container |

---

## Visueel Resultaat

```text
┌──────────────────────────────────────────────────────────────┐
│  GLASS UI PRIMITIVES                                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  📢 TOAST NOTIFICATION                                  │ │
│  │  ░░░ GLASS + CONTEXT SHADOW (green/red/blue) ░░░        │ │
│  │  "Taak succesvol opgeslagen!"          [Ongedaan maken] │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────┐    ┌────────────────────┐            │
│  │  💬 TOOLTIP        │    │  🖱️ CONTEXT MENU   │            │
│  │  ░░░ GLASS ░░░     │    │  ░░░ GLASS ░░░     │            │
│  │  "Klik om te..."   │    │  ✏️ Bewerken       │            │
│  └────────────────────┘    │  🗑️ Verwijderen    │            │
│                            └────────────────────┘            │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  🔍 EMPTY STATE                                         │ │
│  │  ░░░ GLASS CONTAINER ░░░                                │ │
│  │                                                         │ │
│  │         ┌──────────┐                                    │ │
│  │         │ 📋 Icon  │ (glass circle)                     │ │
│  │         └──────────┘                                    │ │
│  │         Geen taken gevonden                             │ │
│  │                                                         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  ████████████████████████  SKELETON                  │    │
│  │  ░░░ GLASS SHIMMER ░░░                               │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Design Principes (Apple visionOS)

| Principe | Implementatie |
|----------|---------------|
| **Consistent Materials** | Alle floating elements gebruiken 90% opacity + blur-xl |
| **Context Shadows** | Toast types erven HSL kleur (success=green, error=red) |
| **Layered Depth** | Multi-layer shadows voor alle popovers |
| **Subtle Borders** | `border-white/30` light, `border-white/15` dark |
| **Dark Mode Ready** | Alle styling met `.dark` varianten |

---

## Acceptatiecriteria

1. Toast notifications hebben glassmorphism met context-gekleurde shadows
2. Popover, HoverCard en Tooltip hebben glass styling
3. Context menu heeft glass styling met glass item hovers
4. Sheet overlay heeft blur en content heeft glass panel
5. Skeleton heeft glass shimmer effect
6. TaskListEmptyState heeft glass container met icon circle
7. Alle componenten zijn dark mode compatibel
8. Animaties en transitions blijven intact

