

# Fase 9: Definitieve Drag-and-Drop Cursor Fix

## Probleem Geidentificeerd

Op basis van de screenshot zie ik dat de cursor (rode stip rechtsonder) nog steeds niet goed aansluit bij de gesleepte kaart. Dit komt door:

1. **De `rotate-[1.5deg]` transformatie** - Dit verandert het visuele centrum van de kaart en creëert een waargenomen offset
2. **Geen transform-origin specificatie** - De rotatie draait rond het centrum van de kaart, niet rond de cursor

## Oplossing

### Strategie 1: Verwijder Rotatie Volledig (Aanbevolen)

De rotatie is puur cosmetisch en veroorzaakt het cursor offset probleem. We vervangen het door alleen een premium shadow effect voor het "zwevende" gevoel.

### Wijzigingen

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx` (regel 697-706)**

```tsx
// HUIDIGE CODE (PROBLEEM)
<DragOverlay dropAnimation={null}>
  {activeTask && (
    <div className="opacity-95 rotate-[1.5deg] cursor-grabbing">  {/* ❌ rotate veroorzaakt offset */}
      <div className="glass-drag-overlay">
        <TaskCard task={activeTask} />
      </div>
    </div>
  )}
</DragOverlay>

// NIEUWE CODE (FIX)
<DragOverlay dropAnimation={null}>
  {activeTask && (
    <div className="cursor-grabbing">
      <div className="glass-drag-overlay-enhanced">
        <TaskCard task={activeTask} />
      </div>
    </div>
  )}
</DragOverlay>
```

**Bestand: `src/pages/Kanban.tsx` (regel 884-895)**

Synchroniseer dezelfde fix:

```tsx
<DragOverlay dropAnimation={null}>
  {activeTask && (
    <div className="cursor-grabbing">
      <div className="glass-drag-overlay-enhanced">
        <TaskCard 
          task={activeTask} 
          subtasks={subtasksByTaskId.get(activeTask.id) || []}
        />
      </div>
    </div>
  )}
</DragOverlay>
```

**Bestand: `src/index.css`**

Vervang de bestaande `.glass-drag-overlay` met een enhanced versie die geen transforms gebruikt maar alleen premium shadows:

```css
/* Drag overlay - premium floating effect WITHOUT any transforms */
.glass-drag-overlay-enhanced {
  position: relative;
  border-radius: 0.75rem;
  /* Premium multi-layer shadow for maximum floating effect */
  box-shadow:
    /* Ambient shadow - large, soft, colored */
    0 25px 60px -15px hsla(234, 45%, 52%, 0.30),
    /* Main shadow - medium distance */
    0 15px 35px -10px hsla(234, 45%, 52%, 0.20),
    /* Close shadow - sharp definition */
    0 5px 15px -5px hsla(234, 45%, 52%, 0.15),
    /* Inner highlight - top edge glow */
    inset 0 1px 2px rgba(255, 255, 255, 0.25),
    /* Subtle border glow */
    0 0 0 1px hsla(234, 45%, 52%, 0.08);
  /* Slightly elevated scale without affecting cursor position */
  /* NO rotate, NO scale - only shadows for floating effect */
  transition: none !important;
  will-change: transform;
  /* Ensure card content also has no transforms */
  transform: none !important;
}

.dark .glass-drag-overlay-enhanced {
  box-shadow:
    0 25px 60px -15px hsla(234, 45%, 15%, 0.55),
    0 15px 35px -10px hsla(234, 45%, 15%, 0.40),
    0 5px 15px -5px hsla(234, 45%, 15%, 0.30),
    inset 0 1px 2px rgba(255, 255, 255, 0.10),
    0 0 0 1px hsla(234, 45%, 52%, 0.15);
}
```

---

## Gemiste Glassmorphism Elementen

Na analyse van de screenshot zie ik ook deze elementen die nog premium glass kunnen krijgen:

### 1. De rode "Verlopen" badge

De deadline badge kan meer diepte krijgen.

### 2. Task status dot

De rode stip rechtsonder de kaart (status indicator) kan subtieler.

---

## Samenvatting Wijzigingen

| Bestand | Wijzigingen |
|---------|-------------|
| `src/components/dashboard/MyTasksFlowSection.tsx` | Verwijder `rotate-[1.5deg]`, gebruik `glass-drag-overlay-enhanced` |
| `src/pages/Kanban.tsx` | Synchroniseer dezelfde fix |
| `src/index.css` | Nieuwe `.glass-drag-overlay-enhanced` class zonder transforms |

---

## Visueel Resultaat

```text
VOOR (Probleem):
                    ┌──────────────────┐
                    │    Taak Kaart    │
                    │                  │    ← Kaart gedraaid
                    └──────────────────┘
                                        ↖
                                    🖱️ Cursor hier (ver weg door rotatie)

NA (Fix):
    🖱️┌──────────────────┐
      │    Taak Kaart    │    ← Cursor op de kaart
      │                  │
      └──────────────────┘
      ░░░░░░░░░░░░░░░░░░░░    ← Premium shadow geeft floating effect
       ░░░ INDIGO GLOW ░░░
```

## Design Principe

Het "zwevende" gevoel wordt nu volledig bereikt door **shadows** in plaats van **transforms**:

- **Transforms (rotate, scale)** = Veranderen de geometrie en veroorzaken cursor offset
- **Shadows** = Visuele illusie van diepte zonder de positie te veranderen

Dit is hoe Apple visionOS ook werkt - diepte wordt gesimuleerd met schaduwen en blur, niet met geometrische transformaties.

