
# Notificatie Bel: Kleuraccenten per Type

## Huidige Situatie
De bel werkt correct: popover opent, sluit bij klik, scrollt bij veel meldingen, en filtert per gebruiker. Enige visuele differentiatie is via emoji's. Bij meerdere meldingen van hetzelfde type zijn items moeilijk te onderscheiden.

## Voorstel: Subtiele Kleur-Indicatoren
Voeg een dunne linkerborder toe per notificatietype, consistent met het bestaande design systeem (zoals DienstCard al doet).

### Kleurschema (4 types)

| Type | Emoji | Kleur | Rationale |
|------|-------|-------|-----------|
| task_assigned | Pin | Indigo (primary) | Past bij "Mijn Werk" tab context |
| subtask_assignment | Klembord | Teal | Past bij actie/delegatie |
| diploma_upgrade | Graduatiehoed | Emerald | Positief resultaat |
| vog_verified | Document | Amber | Verificatie/aandacht |

### Implementatie

**1 bestand: `NotificationBell.tsx`**

Toevoegen van een `getNotificationColor()` helper die een border-kleur retourneert per type:

```typescript
const getNotificationColor = (type: string) => {
  switch (type) {
    case "task_assigned": return "border-l-primary";
    case "subtask_assignment": return "border-l-teal-500";
    case "diploma_upgrade": return "border-l-emerald-500";
    case "vog_verified": return "border-l-amber-500";
    default: return "border-l-muted-foreground/30";
  }
};
```

Toepassen op elk notificatie-item:
- `border-l-2` toevoegen aan de bestaande className
- `rounded-lg` vervangen door `rounded-r-lg` (zodat de linkerborder scherp blijft)

### Visueel Resultaat
Elke notificatie krijgt een subtiel 2px kleuraccent aan de linkerkant, vergelijkbaar met hoe de DienstCard en kanban-kolommen al werken in het design systeem. Dit is Apple-consistent, niet "schreeuwerig".

### Impact
- 1 bestand gewijzigd
- ~10 regels code toegevoegd
- Geen nieuwe dependencies
- Consistent met bestaand design systeem (designTokens, DienstCard border pattern)
