

# Fix: HoverCard niet zichtbaar door ontbrekende Portal

## Probleem

De `HoverCardContent` in `src/components/ui/hover-card.tsx` mist een `<HoverCardPrimitive.Portal>` wrapper. Hierdoor wordt de hover-popup gerenderd **binnen** de overflow-container van de kolom (`max-h-[70vh] overflow-y-auto`), waardoor de content wordt afgeknipt en onzichtbaar is.

Browser-test bevestigt: na 2 seconden hoveren verschijnt de HoverCard **niet** — alleen tekst-fragmenten zichtbaar aan de rand van de kolom.

## Oplossing

**Bestand:** `src/components/ui/hover-card.tsx`

Wrap `HoverCardPrimitive.Content` in `<HoverCardPrimitive.Portal>` zodat de popup buiten de DOM-hiërarchie van de overflow-containers wordt gerenderd (op `document.body`).

```tsx
// Huidige code (regel 13-27):
)(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <HoverCardPrimitive.Content ... />
));

// Nieuwe code:
)(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <HoverCardPrimitive.Portal>
    <HoverCardPrimitive.Content ... />
  </HoverCardPrimitive.Portal>
));
```

Dit is een 1-regel wijziging die het probleem voor alle HoverCards in de applicatie oplost.

