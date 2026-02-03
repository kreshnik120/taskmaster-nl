
# Diepgaand Technisch Onderzoek: Drag-and-Drop Werkt Niet

## Executive Summary

Na grondige analyse van de codebase, browser testing en @dnd-kit documentatie is de **kritieke root cause** geïdentificeerd:

**De combinatie van Radix UI `HoverCardTrigger asChild` met @dnd-kit `useSortable` listeners creëert een pointer event conflict.**

---

## Root Cause Analyse

### Het Kernprobleem

In `TaskCard.tsx` (regels 156-165) is de structuur als volgt:

```tsx
<HoverCard openDelay={500}>
  <HoverCardTrigger asChild>       {/* ← PROBLEEM: asChild "steelt" events */}
    <div 
      ref={setNodeRef}              {/* ← dnd-kit ref */}
      style={style} 
      className="group touch-none"
      {...attributes}
      {...listeners}                {/* ← dnd-kit pointer events */}
    >
      {/* Task Card Content */}
    </div>
  </HoverCardTrigger>
</HoverCard>
```

### Wat er technisch gebeurt

1. **HoverCardTrigger met `asChild`** merged zijn eigen event handlers op het child element
2. Radix UI's `asChild` implementeert `Slot` die events **doorgeeft maar ook onderschept**
3. De `onPointerDown` van @dnd-kit wordt **overschreven of geblokkeerd** door Radix interne hover tracking
4. @dnd-kit's `PointerSensor` ontvangt nooit de initiële `pointerdown` event - drag start niet

### Bewijs uit Code

Radix `Slot` (gebruikt door `asChild`) doet het volgende:
```tsx
// Intern in Radix - mergedRef en mergedProps
function Slot({ children, ...slotProps }) {
  // Merge props - kan event handlers overschrijven!
  const childProps = mergeProps(slotProps, child.props);
  return cloneElement(child, childProps);
}
```

De `mergeProps` functie kan de volgorde van event handlers veranderen, waardoor @dnd-kit listeners niet correct worden aangeroepen.

### Browser Test Resultaten

Tijdens mijn browser test:
- Playwright's `dragAndDrop` werkt (native browser events)
- User pointer events worden **niet correct doorgegeven** aan @dnd-kit
- Geen console errors - het probleem is silent event interception

---

## Impact Assessment

| Component | Impact | Ernst |
|-----------|--------|-------|
| TaskCard in MyTasksFlowSection | Drag werkt niet | KRITIEK |
| TaskCard in Kanban page | Zelfde probleem | KRITIEK |
| ApplicationCard in Sollicitaties | Potentieel zelfde | HOOG |

---

## Oplossingsstrategieën

### Optie A: Verplaats HoverCard naar binnen (Aanbevolen)

Maak de drag wrapper BUITEN de HoverCard, zodat @dnd-kit volledige controle heeft:

```tsx
// VOOR (PROBLEMATISCH)
<HoverCard>
  <HoverCardTrigger asChild>
    <div ref={setNodeRef} {...listeners}>
      <Card>...</Card>
    </div>
  </HoverCardTrigger>
</HoverCard>

// NA (CORRECT)
<div ref={setNodeRef} {...attributes} {...listeners}>
  <HoverCard>
    <HoverCardTrigger asChild>
      <Card>...</Card>           {/* HoverCard werkt op Card, niet op drag wrapper */}
    </HoverCardTrigger>
  </HoverCard>
</div>
```

### Optie B: Verwijder HoverCard Volledig

Als HoverCard geen kritische functionaliteit is, verwijder het:

```tsx
<div ref={setNodeRef} {...attributes} {...listeners}>
  <Card>...</Card>
</div>
```

De HoverCard content kan worden verplaatst naar een Tooltip of de TaskDetailModal.

### Optie C: Dedicated Drag Handle met `setActivatorNodeRef`

Gebruik een aparte drag handle die NIET in de HoverCard zit:

```tsx
const { setNodeRef, setActivatorNodeRef, listeners, attributes } = useSortable({...});

<div ref={setNodeRef}>
  <HoverCard>
    <HoverCardTrigger asChild>
      <Card>
        {/* Drag handle BUITEN HoverCard invloed */}
        <div 
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
        >
          <GripVertical />
        </div>
        {/* Rest van content */}
      </Card>
    </HoverCardTrigger>
  </HoverCard>
</div>
```

---

## Aanbevolen Implementatie: Optie A

### Waarom Optie A?

1. **Minste code wijzigingen** - alleen wrapper structuur aanpassen
2. **Behoudt HoverCard functionaliteit** - preview blijft werken
3. **Volgt @dnd-kit best practices** - drag wrapper is altijd buitenste element
4. **Consistente ervaring** - hele kaart blijft draggable

### Implementatieplan

#### Bestand: `src/components/TaskCard.tsx`

**Huidige structuur (regels 156-375):**
```tsx
return (
  <HoverCard openDelay={500}>
    <HoverCardTrigger asChild>
      <div 
        ref={setNodeRef} 
        style={style} 
        className="group touch-none"
        {...attributes}
        {...listeners}
      >
        <Card className="glass-task-card ...">
          ...
        </Card>
      </div>
    </HoverCardTrigger>
    <HoverCardContent>...</HoverCardContent>
  </HoverCard>
);
```

**Nieuwe structuur:**
```tsx
return (
  <div 
    ref={setNodeRef} 
    style={style} 
    className="group touch-none"
    {...attributes}
    {...listeners}
  >
    <HoverCard openDelay={500}>
      <HoverCardTrigger asChild>
        <Card className="glass-task-card ...">
          ...
        </Card>
      </HoverCardTrigger>
      <HoverCardContent>...</HoverCardContent>
    </HoverCard>
  </div>
);
```

**Veranderingen:**
1. Drag wrapper (`div` met `ref`, `listeners`, etc.) wordt **buitenste** element
2. HoverCard wordt **binnenste** component
3. HoverCardTrigger wraps nu alleen de Card component

---

## Bestanden Overzicht

| Bestand | Actie | Wijzigingen |
|---------|-------|-------------|
| `src/components/TaskCard.tsx` | REFACTOR | Herstructureer wrapper volgorde: drag wrapper buiten, HoverCard binnen |

**Totaal: 1 bestand, structurele wijziging**

---

## Acceptatiecriteria

1. Taken kunnen worden vastgepakt en gesleept naar andere kolommen
2. Taak blijft exact onder cursor tijdens drag (geen offset)
3. Taak wordt correct losgelaten bij pointer up
4. HoverCard preview verschijnt nog steeds na 500ms hover
5. Klikken op taak opent nog steeds de detail modal
6. Toast notificatie verschijnt na succesvolle verplaatsing
7. Geen console errors

---

## Technische Achtergrond

### Radix UI Slot Mechanisme

Radix's `asChild` patroon gebruikt `@radix-ui/react-slot` dat:
- Child props merged met parent props
- Event handlers combineert via `composeEventHandlers`
- **Maar**: kan de volgorde van handlers beïnvloeden
- **En**: kan `pointer-events` management toevoegen voor hover detection

### @dnd-kit PointerSensor Requirements

De PointerSensor vereist:
- `pointerdown` event op exact het element met `listeners`
- Geen interferentie van parent event handlers
- `touch-action: none` CSS (correct ingesteld)
- Geen `pointer-events: none` op het element

### De Conflictzone

```text
┌─────────────────────────────────────────────────────────────────┐
│  EVENT FLOW ANALYSE                                             │
│                                                                 │
│  HUIDIGE (KAPOT):                                               │
│                                                                 │
│  User Pointer Down                                              │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────┐                    │
│  │ HoverCardTrigger (asChild Slot)         │                    │
│  │   - Intercepts pointerdown              │                    │
│  │   - Runs hover tracking logic           │                    │
│  │   - Calls child handler (maybe)         │ ← HIER GAAT HET    │
│  └──────────────┬──────────────────────────┘   FOUT             │
│                 │                                               │
│                 ▼                                               │
│  ┌─────────────────────────────────────────┐                    │
│  │ @dnd-kit listeners                      │                    │
│  │   - onPointerDown                       │ ← WORDT NIET       │
│  │   - Zou drag moeten starten             │   BEREIKT          │
│  └─────────────────────────────────────────┘                    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  NA FIX:                                                        │
│                                                                 │
│  User Pointer Down                                              │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────┐                    │
│  │ Drag Wrapper (div)                      │                    │
│  │   - @dnd-kit listeners FIRST            │ ← DRAG WERKT!      │
│  │   - onPointerDown triggers sensor       │                    │
│  └──────────────┬──────────────────────────┘                    │
│                 │                                               │
│                 ▼                                               │
│  ┌─────────────────────────────────────────┐                    │
│  │ HoverCard (inside)                      │                    │
│  │   - Alleen hover op Card                │                    │
│  │   - Geen conflict met drag              │                    │
│  └─────────────────────────────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Risico's & Mitigatie

| Risico | Impact | Mitigatie |
|--------|--------|-----------|
| HoverCard positie verandert | Low | Side/align props aanpassen indien nodig |
| CSS styling breekt | Low | Card behoudt alle styling, wrapper is transparent |
| Click handler werkt niet | Medium | handleCardClick op inner div behouden |
| Focus ring verkeerd element | Low | Focus ring op Card component houden |

---

## Verificatie Checklist

Na implementatie:

- [ ] Drag werkt op TaskCard in "Mijn Werk" tab
- [ ] Drag werkt op TaskCard in Kanban pagina  
- [ ] HoverCard preview verschijnt bij hover
- [ ] Click opent TaskDetailModal
- [ ] Geen visuele regressies
- [ ] Console is schoon van errors
- [ ] Touch devices werken correct
