

# Kritische Fix: Drag-and-Drop Event Handler Conflict

## Gevonden Probleem

De drag-and-drop werkt niet meer omdat de **custom event handlers de @dnd-kit listeners overschrijven**.

### Huidige Code (Problematisch)
```tsx
<div 
  ref={setNodeRef} 
  style={style} 
  className="group touch-none"
  {...attributes}
  {...listeners}           // ← @dnd-kit onPointerDown zit HIER
  onPointerDown={handlePointerDown}  // ← Dit OVERSCHRIJFT de @dnd-kit handler!
  onPointerMove={handlePointerMove}  // ← Dit OVERSCHRIJFT ook!
>
```

**Waarom dit faalt:**
- Wanneer je `{...listeners}` spread, voegt @dnd-kit o.a. `onPointerDown` toe
- Daarna definiëren we onze eigen `onPointerDown={handlePointerDown}`
- React neemt alleen de **laatste** handler - de @dnd-kit handler wordt volledig genegeerd
- Resultaat: drag start nooit omdat de sensor events nooit bij @dnd-kit aankomen

---

## Oplossing: Event Handler Compositie

We moeten de handlers **combineren** in plaats van overschrijven:

### Correcte Aanpak
```tsx
<div 
  ref={setNodeRef} 
  style={style} 
  className="group touch-none"
  {...attributes}
  {...listeners}
  onPointerDown={(e) => {
    // Onze tracking EERST
    handlePointerDown(e);
    // Dan @dnd-kit handler aanroepen als die bestaat
    listeners?.onPointerDown?.(e);
  }}
  onPointerMove={(e) => {
    handlePointerMove(e);
    listeners?.onPointerMove?.(e);
  }}
>
```

**Echter**, dit is fragiel. Een betere aanpak is om de tracking logica **niet** op de drag container te zetten, maar alleen in de click handler te checken of we al aan het draggen zijn.

### Beste Oplossing: Vertrouw op isDragging

Aangezien @dnd-kit met `distance: 8` al onderscheid maakt tussen click en drag, kunnen we onze custom handlers volledig verwijderen en alleen `isDragging` checken:

```tsx
// Simpele, robuuste implementatie
const handleCardClick = (e: React.MouseEvent) => {
  if ((e.target as HTMLElement).closest('button')) return;
  if (isDragging) return;  // @dnd-kit beheert dit al
  onClick?.(task);
};

// Render - geen custom pointer handlers nodig
<div 
  ref={setNodeRef} 
  style={style} 
  className="group touch-none"
  {...attributes}
  {...listeners}
  // GEEN onPointerDown of onPointerMove - laat @dnd-kit zijn werk doen
>
```

Dit werkt omdat:
1. `PointerSensor` met `distance: 8` activeert drag pas na 8px beweging
2. Als de gebruiker minder dan 8px beweegt, is het een click en `isDragging` blijft `false`
3. Als de gebruiker meer dan 8px beweegt, activeert drag en wordt `isDragging` = `true`
4. De `onClick` handler checkt `isDragging` en negeert clicks tijdens drag

---

## Implementatieplan

### Bestand: `src/components/TaskCard.tsx`

**Wijzigingen:**

1. **Verwijder** de `startPos` en `hasMoved` refs
2. **Verwijder** de `handlePointerDown` en `handlePointerMove` functies
3. **Verwijder** de `onPointerDown` en `onPointerMove` props van de div
4. **Vereenvoudig** `handleCardClick` om alleen `isDragging` te checken

**Van:**
```tsx
// Track pointer movement for click vs drag distinction (distance-based)
const startPos = useRef({ x: 0, y: 0 });
const hasMoved = useRef(false);

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
  if ((e.target as HTMLElement).closest('button')) return;
  if (hasMoved.current || isDragging) return;
  onClick?.(task);
};

// In render:
<div 
  {...attributes}
  {...listeners}
  onPointerDown={handlePointerDown}
  onPointerMove={handlePointerMove}
>
```

**Naar:**
```tsx
const handleCardClick = (e: React.MouseEvent) => {
  if ((e.target as HTMLElement).closest('button')) return;
  if (isDragging) return; // @dnd-kit beheert dit automatisch
  onClick?.(task);
};

// In render:
<div 
  {...attributes}
  {...listeners}
  // Geen custom pointer handlers - @dnd-kit beheert drag/click onderscheid
>
```

---

## Bestanden Overzicht

| Bestand | Actie | Wijzigingen |
|---------|-------|-------------|
| `src/components/TaskCard.tsx` | EDIT | Verwijder custom pointer handlers die @dnd-kit overschrijven |

**Totaal: 1 bestand, ~20 regels verwijderd/vereenvoudigd**

---

## Acceptatiecriteria

1. Taak kan worden vastgepakt en gesleept naar andere kolom
2. Korte klik (< 8px beweging) opent nog steeds detail modal
3. Geen tekst selectie tijdens drag pogingen
4. Toast notificatie verschijnt na succesvolle verplaatsing
5. Geen console errors

---

## Technische Notitie

Dit is een klassieke "event handler shadowing" bug in React. Wanneer je spread operators gebruikt voor props (`{...listeners}`), worden de handlers als individuele props toegevoegd. Als je daarna dezelfde prop opnieuw definieert, overschrijft de laatste definitie de vorige volledig.

**Best Practice:** Gebruik nooit custom handlers op dezelfde props die door een library worden beheerd, tenzij je expliciet de library handler aanroept vanuit jouw handler.

