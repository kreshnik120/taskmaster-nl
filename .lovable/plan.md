
# Fase 19: Intuïtieve Drag-and-Drop UX Verbetering

## Probleem Analyse

Na analyse van de video en code is het probleem duidelijk: **gebruikers verwachten overal op de taakkaart te kunnen klikken en vasthouden om te slepen**, maar momenteel:

1. **Drag werkt alleen via de grip handle** (kleine ⋮⋮ puntjes links)
2. **Klikken ergens anders opent de detail modal** (onClick handler)
3. Dit is **niet intuïtief** voor de meeste gebruikers

### Huidige Interactie (Verwarrend)
| Actie | Resultaat |
|-------|-----------|
| Klik op grip handle + sleep | ✅ Drag werkt |
| Klik ergens op kaart | ❌ Opent modal (verwacht: drag starten) |
| Lang indrukken op kaart | ❌ Geen effect |

### Gewenste Interactie (Intuïtief)
| Actie | Resultaat |
|-------|-----------|
| Klik + kort vasthouden + sleep | ✅ Drag start |
| Korte klik (tap) | ✅ Opent modal |
| Dubbelklik | ✅ Opent modal |

---

## Oplossing: Touch-Friendly Drag Activation

We passen de `PointerSensor` aan met een **delay-gebaseerde activatie** in plaats van alleen afstand. Dit betekent:

- **Korte klik (< 250ms)** = Opent detail modal
- **Lang indrukken (> 250ms) + beweging** = Start drag

Dit patroon wordt gebruikt door Trello, Notion, en andere moderne Kanban-tools.

---

## Implementatieplan

### Stap 1: MyTasksFlowSection - Sensor Configuratie Updaten

**Bestand:** `src/components/dashboard/MyTasksFlowSection.tsx`

**Huidige code (regel 188-192):**
```typescript
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 10 },
  })
);
```

**Nieuwe code:**
```typescript
import { PointerSensor, TouchSensor, MouseSensor } from "@dnd-kit/core";

const sensors = useSensors(
  // Mouse: delay van 150ms OF 10px beweging
  useSensor(MouseSensor, {
    activationConstraint: {
      delay: 150,
      tolerance: 5,
    },
  }),
  // Touch: delay van 200ms voor onderscheid van scroll
  useSensor(TouchSensor, {
    activationConstraint: {
      delay: 200,
      tolerance: 8,
    },
  })
);
```

### Stap 2: TaskCard - Drag Listeners op Hele Kaart

**Bestand:** `src/components/TaskCard.tsx`

**Wijzigingen:**

1. Verplaats `{...attributes} {...listeners}` van grip handle naar de hele kaart container
2. Behoud grip handle als visuele indicator (zonder listeners)
3. Voeg `touch-action: none` toe voor betere touch-respons

**Huidige structuur:**
```tsx
<div ref={setNodeRef} style={style}>
  <Card>
    <div {...attributes} {...listeners}> // Alleen grip heeft listeners
      <GripVertical />
    </div>
    <div onClick={handleCardClick}> // Rest is click-only
      // Content
    </div>
  </Card>
</div>
```

**Nieuwe structuur:**
```tsx
<div 
  ref={setNodeRef} 
  style={style}
  {...attributes}
  {...listeners}  // Hele kaart is draggable
  className="touch-none"
>
  <Card>
    <div> // Grip is nu alleen visueel
      <GripVertical />
    </div>
    <div onClick={handleCardClick}>
      // Content - klik werkt nog steeds door delay
    </div>
  </Card>
</div>
```

### Stap 3: Click vs Drag Onderscheid in TaskCard

Om te voorkomen dat de modal opent tijdens drag, voegen we state tracking toe:

```typescript
const [isDragIntent, setIsDragIntent] = useState(false);
const pointerDownTime = useRef<number>(0);

const handlePointerDown = () => {
  pointerDownTime.current = Date.now();
  setIsDragIntent(false);
};

const handleCardClick = (e: React.MouseEvent) => {
  // Skip als het een drag was (meer dan 150ms ingedrukt)
  const pressDuration = Date.now() - pointerDownTime.current;
  if (pressDuration > 150 || isDragging) {
    return;
  }
  onClick?.(task);
};
```

---

## Visueel Diagram: Nieuwe Interactie Flow

```text
┌────────────────────────────────────────────────────────────┐
│  TAAKKAART INTERACTIE - VERBETERDE UX                      │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  [⋮⋮]  K  Specialist controle t...                   │  │
│  │                                                      │  │
│  │       Vandaag                                        │  │
│  └──────────────────────────────────────────────────────┘  │
│         ▲                                                  │
│         │                                                  │
│  ┌──────┴──────────────────────────────────────────────┐   │
│  │                                                      │   │
│  │   KORTE KLIK (< 150ms)                              │   │
│  │   ────────────────────                              │   │
│  │   → Opent TaskDetailModal                           │   │
│  │                                                      │   │
│  │   LANG INDRUKKEN (> 150ms) + BEWEGING               │   │
│  │   ────────────────────────────────────              │   │
│  │   → Start Drag-and-Drop                             │   │
│  │   → Cursor verandert naar 'grabbing'                │   │
│  │   → Kaart volgt muis/vinger                         │   │
│  │                                                      │   │
│  │   TOUCH/MOBIEL (> 200ms delay)                      │   │
│  │   ──────────────────────────                        │   │
│  │   → Langere delay voorkomt conflict met scroll      │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Bestanden Overzicht

| Bestand | Actie | Wijzigingen |
|---------|-------|-------------|
| `src/components/dashboard/MyTasksFlowSection.tsx` | EDIT | Sensor configuratie met MouseSensor + TouchSensor met delay |
| `src/components/TaskCard.tsx` | EDIT | Drag listeners op hele kaart, click/drag onderscheid |

**Totaal: 2 bestanden bewerken**

---

## Acceptatiecriteria

1. ✅ Overal op de kaart klikken en 150ms+ vasthouden start drag
2. ✅ Korte klik (< 150ms) opent nog steeds de detail modal
3. ✅ Touch op mobiel werkt met 200ms delay (voorkomt scroll-conflict)
4. ✅ Grip handle blijft zichtbaar als visuele indicator
5. ✅ Cursor verandert naar `grabbing` tijdens drag
6. ✅ Geen regressie in bestaande keyboard accessibility
7. ✅ Modal opent NIET na een drag-and-drop actie

---

## Technische Notities

### Waarom Delay-Based Activatie?

| Methode | Voordelen | Nadelen |
|---------|-----------|---------|
| Distance-only (huidige) | Snel | Conflicteert met click |
| Delay-only | Intuïtief | Kan traag voelen |
| **Delay + Tolerance** | Beste van beide | Iets complexer |

De combinatie van `delay: 150` met `tolerance: 5` betekent:
- Na 150ms indrukken wordt drag geactiveerd
- OF na 5px beweging binnen die 150ms
- Korte taps blijven clicks

### Touch-Specifieke Overwegingen

Op touch devices is 200ms delay nodig omdat:
- Scroll gestures ook pointer events triggeren
- Gebruikers langzamer zijn met touch dan muis
- iOS heeft eigen gesture delays die we moeten respecteren

---

## Verwacht Resultaat

Na implementatie:

1. **Intuïtieve UX**: Gebruikers kunnen overal op de kaart klikken en slepen
2. **Geen conflict**: Korte clicks openen modal, lange press start drag
3. **Touch-friendly**: Werkt goed op tablets en mobiel
4. **Visuele feedback**: Grip handle toont dat slepen mogelijk is
