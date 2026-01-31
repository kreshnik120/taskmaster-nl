

## Uitbreiding: Achtergrond Customization naar Andere Componenten

### Huidige Situatie

De achtergrond customization werkt nu alleen in `WhatsAppChatDetail`. De gebruiker wil dat andere delen van de interface ook dezelfde achtergrond gebruiken.

---

### Analyse van de Screenshots

Op basis van de afbeeldingen:

| Component | Huidige Achtergrond | Moet Wijzigen? |
|-----------|---------------------|----------------|
| Chat berichten area | ✅ Dynamisch (werkt) | Nee |
| Empty state (geen chat geselecteerd) | `bg-muted/30` | **Ja** |
| Chat list sidebar | `bg-background` | Nee (blijft wit/dark voor leesbaarheid) |
| Contact profile | `bg-background` | Nee (moet leesbaar blijven) |

De **empty state** in het midden moet ook de geselecteerde achtergrond krijgen, zodat het consistent is wanneer je geen chat hebt geselecteerd.

---

### Wijzigingen

#### Bestand 1: WhatsAppEmptyState.tsx

De `WhatsAppEmptyState` component moet de achtergrond hook gebruiken:

**Imports toevoegen:**
```typescript
import { useWhatsAppBackground, backgroundClasses } from "@/hooks/whatsapp/useWhatsAppBackground";
import { cn } from "@/lib/utils";
```

**Hook gebruiken in component:**
```typescript
export function WhatsAppEmptyState({ stats }: WhatsAppEmptyStateProps) {
  const { background } = useWhatsAppBackground();
  
  return (
    <div className={cn(
      "flex flex-col items-center justify-center h-full p-8",
      backgroundClasses[background]
    )}>
```

Dit vervangt de huidige `bg-muted/30` met de dynamische achtergrond.

---

### Visueel Effect

```text
VOOR:
┌─────────────────────────────────────────┐
│ Chat List │      Empty State            │
│ (wit)     │      (lichtgrijs/muted)     │
│           │                             │
│  Chat 1   │    📩 WhatsApp Inbox        │
│  Chat 2   │    Selecteer een gesprek    │
│  Chat 3   │                             │
└───────────┴─────────────────────────────┘

NA (met bijv. "Gradient" geselecteerd):
┌─────────────────────────────────────────┐
│ Chat List │      Empty State            │
│ (wit)     │      (gradient background)  │
│           │      ↓ zelfde als chat ↓    │
│  Chat 1   │    📩 WhatsApp Inbox        │
│  Chat 2   │    Selecteer een gesprek    │
│  Chat 3   │                             │
└───────────┴─────────────────────────────┘
```

---

### Bestanden Overzicht

| Bestand | Actie | Wijzigingen |
|---------|-------|-------------|
| `WhatsAppEmptyState.tsx` | Wijzig | Import hook + apply backgroundClasses |

---

### Test Checklist

- [ ] Selecteer chat → achtergrond past zich aan ✓ (al getest)
- [ ] Deselecteer chat (ga naar empty state) → zelfde achtergrond zichtbaar
- [ ] Wissel achtergrond in picker → empty state update ook
- [ ] Werkt in light mode en dark mode
- [ ] Pattern optie zichtbaar in empty state

