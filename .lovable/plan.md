

# Kritische Drag-and-Drop Bug Fix: Vastgeplakte Cursor & Offset Verschuiving

## Root Cause Analyse

Na grondige analyse van de code, de session replay data, en @dnd-kit documentatie zijn er **twee kritische problemen** geïdentificeerd:

### Probleem 1: Taak "springt naar beneden" bij vastpakken

**Oorzaak:** De combinatie van `MouseSensor` met `delay` activatie en de CSS `touch-none` op het sorteerbare element veroorzaakt een offset probleem. Wanneer de delay wordt bereikt, berekent @dnd-kit de initiële positie van het element, maar de muiscursor is dan al verplaatst ten opzichte van waar de gebruiker oorspronkelijk klikte.

**Technische details:**
- `MouseSensor` met `delay: 150` activeert pas na 150ms
- Gedurende die 150ms kan de muis al bewegen
- @dnd-kit berekent de offset op het moment van activatie, niet op het moment van pointer down
- Dit veroorzaakt de visuele "sprong" naar beneden

### Probleem 2: Taak blijft "vastgeplakt" na loslaten

**Oorzaak:** Dit is een bekend @dnd-kit issue met de `DragOverlay` en `dropAnimation`. Momenteel is `dropAnimation={null}` ingesteld, wat betekent dat er geen animatie is. Echter, als de `activeTask` state niet correct wordt gereset vóór de DOM cleanup, kan de overlay blijven hangen.

**Technische details uit session replay:**
```
1770108020062: Draggable item was dropped
1770108020065: Element verwijderd uit parent
```
De timing suggereert dat de state reset te laat gebeurt.

---

## Oplossing: 3-Staps Fix

### Stap 1: Sensor Configuratie Aanpassen

**Bestand:** `src/components/dashboard/MyTasksFlowSection.tsx`

**Probleem:** `delay` activatie veroorzaakt cursor offset.

**Oplossing:** Gebruik `distance` in plaats van `delay` voor activatie. Dit is de standaard @dnd-kit aanpak die geen offset problemen veroorzaakt.

```typescript
// HUIDIGE CODE (PROBLEMATISCH)
const sensors = useSensors(
  useSensor(MouseSensor, {
    activationConstraint: {
      delay: 150,
      tolerance: 5,
    },
  }),
  useSensor(TouchSensor, {
    activationConstraint: {
      delay: 200,
      tolerance: 8,
    },
  })
);

// NIEUWE CODE (FIX)
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8, // 8px movement before drag starts
    },
  })
);
```

**Waarom dit werkt:**
- `distance: 8` betekent dat de gebruiker 8px moet bewegen voordat drag start
- Dit onderscheidt click van drag zonder timing-gerelateerde offset issues
- PointerSensor werkt voor zowel mouse als touch

### Stap 2: TaskCard Click/Drag Onderscheid Verbeteren

**Bestand:** `src/components/TaskCard.tsx`

**Probleem:** Met `distance`-based activatie moeten we nog steeds click vs drag kunnen onderscheiden.

**Oplossing:** Gebruik de `isDragging` state van useSortable in combinatie met een pointer beweging tracker.

```typescript
// Track of er significante beweging was
const hasMoved = useRef(false);
const startPos = useRef({ x: 0, y: 0 });

const handlePointerDown = (e: React.PointerEvent) => {
  startPos.current = { x: e.clientX, y: e.clientY };
  hasMoved.current = false;
};

const handlePointerMove = (e: React.PointerEvent) => {
  const dx = Math.abs(e.clientX - startPos.current.x);
  const dy = Math.abs(e.clientY - startPos.current.y);
  if (dx > 5 || dy > 5) {
    hasMoved.current = true;
  }
};

const handleCardClick = (e: React.MouseEvent) => {
  // Skip als er beweging was of tijdens drag
  if (hasMoved.current || isDragging) return;
  onClick?.(task);
};
```

### Stap 3: DragOverlay State Reset Robuuster Maken

**Bestand:** `src/components/dashboard/MyTasksFlowSection.tsx`

**Probleem:** `activeTask` wordt mogelijk te laat gereset.

**Oplossing:** Reset `activeTask` aan het begin van `handleDragEnd`, niet aan het einde.

```typescript
const handleDragEnd = async (event: DragEndEvent) => {
  // IMMEDIATE state reset - FIRST ACTION
  const draggedTask = activeTask; // Capture before clearing
  setActiveTask(null); // Clear immediately
  
  // Remove dragging class
  document.documentElement.classList.remove('dnd-dragging');
  
  const { active, over } = event;
  
  // Clear drag context
  if (dragContext) {
    dragContext.endDrag();
  }
  
  if (!over || !draggedTask) return;
  
  // ... rest of logic using draggedTask instead of looking it up again
};
```

---

## Alternatieve Benadering: Strikte Grip Handle Mode

Als de bovenstaande fix niet voldoende werkt, is er een alternatief:

**Gebruik een dedicated drag handle met `useDraggable` in plaats van hele kaart draggable:**

```typescript
// In TaskCard
const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
  id: task.id,
});

// Alleen grip handle heeft listeners
<div {...attributes} {...listeners} ref={setDragRef} className="cursor-grab">
  <GripVertical />
</div>

// Rest van kaart is pure click
<div onClick={handleCardClick}>
  {/* content */}
</div>
```

Dit scheidt de concerns volledig en voorkomt alle click/drag conflicten.

---

## Bestanden Overzicht

| Bestand | Actie | Wijzigingen |
|---------|-------|-------------|
| `src/components/dashboard/MyTasksFlowSection.tsx` | EDIT | Sensor config: `PointerSensor` met `distance: 8`, immediate state reset in handleDragEnd |
| `src/components/TaskCard.tsx` | EDIT | Pointer tracking voor click/drag onderscheid |

---

## Visueel Diagram: Verbeterde Drag Flow

```text
┌─────────────────────────────────────────────────────────────────┐
│  NIEUWE DRAG FLOW                                               │
│                                                                 │
│  POINTER DOWN                                                   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────┐                                            │
│  │ Track start pos │                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────────┐                    │
│  │ Beweging > 8px?                         │                    │
│  └──────────────┬──────────────────────────┘                    │
│                 │                                               │
│     ┌───────────┴───────────┐                                   │
│     │ NEE                   │ JA                                │
│     ▼                       ▼                                   │
│  ┌─────────┐        ┌──────────────┐                            │
│  │ CLICK   │        │ DRAG START   │                            │
│  │ Modal   │        │ DragOverlay  │                            │
│  └─────────┘        │ activeert    │                            │
│                     └───────┬──────┘                            │
│                             │                                   │
│                             ▼                                   │
│                     ┌──────────────┐                            │
│                     │ DRAG END     │                            │
│                     │ - activeTask │ ← IMMEDIATE reset          │
│                     │   = null     │                            │
│                     │ - Update DB  │                            │
│                     └──────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Acceptatiecriteria

1. Taak blijft exact onder cursor bij vastpakken (geen offset/sprong)
2. Taak wordt losgelaten bij muis release (niet vastgeplakt)
3. Korte klik opent nog steeds detail modal
4. Drag naar andere kolom werkt correct
5. Toast notificatie toont "Taak verplaatst naar [kolom]"
6. Geen console errors tijdens drag operaties
7. Touch devices: swipe scroll werkt nog steeds

---

## Technische Notities

### Waarom `distance` beter is dan `delay`

| Aspect | `delay` | `distance` |
|--------|---------|------------|
| Cursor offset | ❌ Kan offset veroorzaken | ✅ Geen offset |
| Voelt responsief | ❌ Voelt traag (wachten) | ✅ Instant na threshold |
| Click onderscheid | ✅ Goed | ✅ Goed met tracking |
| Touch compatibility | ⚠️ Conflict met scroll | ✅ Werkt goed |

### @dnd-kit Best Practice

De officiële @dnd-kit documentatie raadt `distance` aan voor de meeste use cases. `delay` is bedoeld voor specifieke scenario's waar je bewust een wachttijd wilt introduceren (bijv. voor right-click context menu's).

---

## Risico's & Mitigatie

| Risico | Impact | Mitigatie |
|--------|--------|-----------|
| Click nog steeds triggert na kleine beweging | Medium | 8px threshold is genoeg voor onderscheid |
| Touch scroll conflict | Low | PointerSensor heeft ingebouwde touch handling |
| Performance impact | Negligible | Pointer tracking is lightweight |

