
# Fase 8: Drag-and-Drop Fix & Gemiste Glassmorphism Verbeteringen

## Probleem 1: Cursor Offset bij Drag-and-Drop

### Analyse
Het probleem zit in de `DragOverlay` component in `src/components/dashboard/MyTasksFlowSection.tsx` (regel 696-702):

```tsx
<DragOverlay>
  {activeTask && (
    <div className="opacity-90 rotate-2 scale-105">  {/* ❌ PROBLEEM */}
      <TaskCard task={activeTask} />
    </div>
  )}
</DragOverlay>
```

De `scale-105` transformatie zorgt ervoor dat de dragged element 5% groter wordt, waardoor het visuele centrum verschuift en de cursor "ver van de kaart" lijkt. Dit is een bekend probleem met CSS transforms op DragOverlay.

### Oplossing
Verwijder de `scale-105` transformatie en vervang door een subtielere visuele feedback:

```tsx
<DragOverlay>
  {activeTask && (
    <div className="opacity-95 shadow-2xl rotate-1">  {/* ✅ FIX */}
      <TaskCard task={activeTask} />
    </div>
  )}
</DragOverlay>
```

**Waarom dit werkt:**
- `scale` transformaties verplaatsen het transform-origin en creëren offset
- `rotate-1` (subtiel) + `shadow-2xl` geeft nog steeds "zwevend" gevoel zonder cursor offset
- `opacity-95` houdt visuele feedback dat je aan het slepen bent

---

## Probleem 2: Gemiste Glassmorphism Elementen

### Analyse van wat nog ontbreekt:

| Element | Locatie | Huidige Status | Actie |
|---------|---------|----------------|-------|
| **Dropdown Menu Action Button** | MyTasksFlowSection.tsx:633 | `bg-background/80 backdrop-blur-sm` | Upgraden naar volledige glass |
| **DropdownMenuContent** | MyTasksFlowSection.tsx:641 | `glass-layer-2` | ✅ OK |
| **Overflow Button** | MyTasksFlowSection.tsx:675-682 | Ghost variant | Voeg glass hover toe |
| **TaskCard tijdens drag** | DragOverlay | Mist premium shadow | Voeg glass-drag-overlay class toe |
| **DroppableColumn hover state** | MyTasksFlowSection.tsx:121 | Heeft ring maar mist premium glow | Verhoog shadow intensiteit |
| **Select dropdown content** | MyTasksFlowSection.tsx:486 | `bg-popover` | Upgraden naar glass |

---

## Technische Implementatie

### 1. DragOverlay Fix + Premium Glass Styling

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx` (regel 696-702)**

```tsx
// VOOR
<DragOverlay>
  {activeTask && (
    <div className="opacity-90 rotate-2 scale-105">
      <TaskCard task={activeTask} />
    </div>
  )}
</DragOverlay>

// NA - Geen scale, subtiele rotatie, premium shadow
<DragOverlay dropAnimation={null}>
  {activeTask && (
    <div className="opacity-95 rotate-[1.5deg] cursor-grabbing">
      <div className="glass-drag-overlay">
        <TaskCard task={activeTask} />
      </div>
    </div>
  )}
</DragOverlay>
```

**Nieuwe CSS class (src/index.css):**

```css
/* Premium drag overlay - floating effect without cursor offset */
.glass-drag-overlay {
  position: relative;
  border-radius: 0.75rem;
  box-shadow:
    0 20px 40px -10px hsla(234, 45%, 52%, 0.25),
    0 12px 24px -8px hsla(234, 45%, 52%, 0.15),
    0 4px 8px hsla(234, 45%, 52%, 0.10),
    inset 0 1px 2px rgba(255, 255, 255, 0.2);
  transition: none; /* Prevent animation lag during drag */
}

.dark .glass-drag-overlay {
  box-shadow:
    0 20px 40px -10px hsla(234, 45%, 15%, 0.50),
    0 12px 24px -8px hsla(234, 45%, 15%, 0.35),
    0 4px 8px hsla(234, 45%, 15%, 0.25),
    inset 0 1px 2px rgba(255, 255, 255, 0.08);
}
```

---

### 2. DroppableColumn Enhanced Hover State

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx` (regel 120-123)**

```tsx
// VOOR
className={`flex-shrink-0 w-72 md:w-64 snap-start transition-all duration-200 ${
  isOver ? "bg-tab-mijn-werk-100/60 dark:bg-tab-mijn-werk-900/40 backdrop-blur-xl rounded-xl ring-2 ring-tab-mijn-werk-400/60 shadow-lg shadow-tab-mijn-werk-500/10" : ""
}`}

// NA - Enhanced glow effect bij hover
className={`flex-shrink-0 w-72 md:w-64 snap-start transition-all duration-200 ${
  isOver 
    ? "bg-tab-mijn-werk-100/70 dark:bg-tab-mijn-werk-900/50 backdrop-blur-xl rounded-xl ring-2 ring-tab-mijn-werk-400/70 shadow-[0_8px_24px_hsla(234,45%,52%,0.20),0_16px_48px_hsla(234,45%,52%,0.12),inset_0_1px_2px_rgba(255,255,255,0.2)]" 
    : ""
}`}
```

---

### 3. DropdownMenuTrigger Button Glass Upgrade

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx` (regel 630-639)**

```tsx
// VOOR
<Button 
  variant="ghost" 
  size="icon" 
  className="h-6 w-6 bg-background/80 backdrop-blur-sm"
>

// NA - Premium glass button
<Button 
  variant="ghost" 
  size="icon" 
  className="h-6 w-6 glass-icon-button"
>
```

---

### 4. Overflow Button Glass Hover

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx` (regel 675-682)**

```tsx
// VOOR
<Button
  variant="ghost"
  size="sm"
  className="w-full text-xs text-tab-mijn-werk-500 hover:text-tab-mijn-werk-600 dark:text-tab-mijn-werk-400 dark:hover:text-tab-mijn-werk-300 hover:bg-tab-mijn-werk-50/50 dark:hover:bg-tab-mijn-werk-900/30"
  onClick={() => navigate("/kanban")}
>

// NA - Glass hover effect
<Button
  variant="ghost"
  size="sm"
  className="w-full text-xs text-tab-mijn-werk-500 hover:text-tab-mijn-werk-600 dark:text-tab-mijn-werk-400 dark:hover:text-tab-mijn-werk-300 hover:bg-white/50 dark:hover:bg-slate-800/50 hover:backdrop-blur-sm hover:shadow-[0_2px_8px_hsla(234,45%,52%,0.08)] transition-all duration-200"
  onClick={() => navigate("/kanban")}
>
```

---

### 5. SelectContent Glass Upgrade

**Bestand: `src/components/dashboard/MyTasksFlowSection.tsx` (regel 486)**

```tsx
// VOOR
<SelectContent className="bg-popover">

// NA - Glass dropdown
<SelectContent className="glass-layer-2 border-white/30 dark:border-white/15">
```

---

### 6. CSS: Drag-Overlay en Enhanced Effects

**Bestand: `src/index.css`**

```css
/* ============================================
   DRAG-AND-DROP PREMIUM EFFECTS - Phase 8
   ============================================ */

/* Drag overlay - premium floating effect */
.glass-drag-overlay {
  position: relative;
  border-radius: 0.75rem;
  box-shadow:
    0 20px 40px -10px hsla(234, 45%, 52%, 0.25),
    0 12px 24px -8px hsla(234, 45%, 52%, 0.15),
    0 4px 8px hsla(234, 45%, 52%, 0.10),
    inset 0 1px 2px rgba(255, 255, 255, 0.2);
  /* No transition during drag for performance */
  transition: none !important;
  will-change: transform;
}

.dark .glass-drag-overlay {
  box-shadow:
    0 20px 40px -10px hsla(234, 45%, 15%, 0.50),
    0 12px 24px -8px hsla(234, 45%, 15%, 0.35),
    0 4px 8px hsla(234, 45%, 15%, 0.25),
    inset 0 1px 2px rgba(255, 255, 255, 0.08);
}

/* Enhanced droppable zone when dragging over */
.droppable-zone-active {
  background: hsla(234, 45%, 52%, 0.08);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 0.75rem;
  box-shadow:
    inset 0 0 0 2px hsla(234, 45%, 52%, 0.30),
    0 8px 24px hsla(234, 45%, 52%, 0.12),
    0 16px 48px hsla(234, 45%, 52%, 0.08);
}

.dark .droppable-zone-active {
  background: hsla(234, 45%, 52%, 0.12);
  box-shadow:
    inset 0 0 0 2px hsla(234, 45%, 52%, 0.40),
    0 8px 24px hsla(234, 45%, 15%, 0.25),
    0 16px 48px hsla(234, 45%, 15%, 0.15);
}

/* Overflow button - glass hover */
.glass-overflow-button {
  transition: all 0.2s ease-out;
}

.glass-overflow-button:hover {
  background: rgba(255, 255, 255, 0.50);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px hsla(234, 45%, 52%, 0.08);
}

.dark .glass-overflow-button:hover {
  background: rgba(30, 41, 59, 0.50);
}

/* Grabbing cursor state */
.dragging-active * {
  cursor: grabbing !important;
}
```

---

### 7. Kanban.tsx DragOverlay Sync

**Bestand: `src/pages/Kanban.tsx` (regel 884-891)**

Synchroniseer de Kanban pagina met dezelfde premium styling:

```tsx
// VOOR
<DragOverlay>
  {activeTask && (
    <TaskCard 
      task={activeTask} 
      subtasks={subtasksByTaskId.get(activeTask.id) || []}
    />
  )}
</DragOverlay>

// NA - Consistent premium styling
<DragOverlay dropAnimation={null}>
  {activeTask && (
    <div className="opacity-95 rotate-[1.5deg] cursor-grabbing">
      <div className="glass-drag-overlay">
        <TaskCard 
          task={activeTask} 
          subtasks={subtasksByTaskId.get(activeTask.id) || []}
        />
      </div>
    </div>
  )}
</DragOverlay>
```

---

## Samenvatting Wijzigingen

| Bestand | Wijzigingen |
|---------|-------------|
| `src/index.css` | +35 regels (glass-drag-overlay, droppable-zone-active, glass-overflow-button, grabbing cursor) |
| `src/components/dashboard/MyTasksFlowSection.tsx` | 5 updates (DragOverlay fix, DroppableColumn, DropdownTrigger, Overflow button, SelectContent) |
| `src/pages/Kanban.tsx` | DragOverlay styling sync |

---

## Verwacht Resultaat

### Drag-and-Drop Verbetering:
- **VOOR**: Cursor lijkt ver van de kaart af tijdens slepen (door `scale-105`)
- **NA**: Cursor blijft bij de kaart, subtiele rotatie + premium shadow geeft "zwevend" gevoel

### Glassmorphism Consistentie:
- Alle dropdown menus, buttons en overlays hebben nu premium glass styling
- Indigo-tinted shadows doorlopend in de hele "Mijn Werk" context
- Drop zones hebben enhanced glow effect wanneer je er overheen sleept

---

## Visueel Resultaat

```text
┌─────────────────────────────────────────────────────────────────────┐
│  VOOR: Cursor ver van kaart tijdens drag                           │
│                                                                     │
│      🖱️ ←─────────────────────────→ ┌─────────────┐                │
│      cursor                     |   │   Taak...   │  (kaart)        │
│      (ver weg)                      └─────────────┘                 │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  NA: Cursor bij de kaart + premium floating shadow                  │
│                                                                     │
│      🖱️┌───────────────────────────────┐                           │
│      ←↓│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│                           │
│         │░░ ╔═══════════════════════╗ ░│                           │
│         │░░ ║      Taak...          ║ ░│                           │
│         │░░ ║  (kaart + shadow)     ║ ░│                           │
│         │░░ ╚═══════════════════════╝ ░│                           │
│         │░░░░░░░░░░ INDIGO SHADOW ░░░░░│                           │
│         └───────────────────────────────┘                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Design Principes Toegepast

| Principe | Implementatie |
|----------|---------------|
| **Cursor Fidelity** | Geen scale transforms in DragOverlay die offset veroorzaken |
| **Visual Feedback** | Shadow + subtle rotation geeft "lifted" gevoel zonder offset |
| **Performance** | `transition: none` en `will-change: transform` op drag overlay |
| **Consistency** | Zelfde styling op MyTasksFlowSection en Kanban |
| **Context Color** | Alle schaduwen gebruiken Indigo (234, 45%) voor "Mijn Werk" context |
