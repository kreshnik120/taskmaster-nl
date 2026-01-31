

## Bugfix: Achtergrond Synchronisatie

### Probleem

De `useWhatsAppBackground` hook creëert **onafhankelijke React state** bij elke aanroep. De picker en chat detail component delen geen state, dus:
- Picker: `background = 'gradient'` (na selectie)
- ChatDetail: `background = 'default'` (oorspronkelijke waarde)

### Oplossing

Implementeer een **synchronisatie mechanisme** zodat alle componenten die de hook gebruiken dezelfde waarde zien. Er zijn twee opties:

**Optie A: Storage Event Listener (Simpel)**
Luister naar `localStorage` wijzigingen om state te synchroniseren tussen hook instanties.

**Optie B: React Context (Meer overhead)**
Wrap de app in een context provider om gedeelde state te hebben.

We kiezen **Optie A** omdat het minder invasief is en geen wijzigingen aan de component tree vereist.

---

### Wijziging: useWhatsAppBackground.ts

De hook moet een `storage` event listener toevoegen om wijzigingen te detecteren EN ook een custom event gebruiken voor synchronisatie binnen hetzelfde window (localStorage events triggeren niet in dezelfde tab):

```typescript
import { useState, useEffect, useCallback } from 'react';

export type BackgroundOption = 'default' | 'solid-light' | 'solid-dark' | 'gradient' | 'pattern';

const STORAGE_KEY = 'whatsapp-background';
const SYNC_EVENT = 'whatsapp-background-change';

export function useWhatsAppBackground() {
  const [background, setBackgroundState] = useState<BackgroundOption>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(STORAGE_KEY) as BackgroundOption) || 'default';
    }
    return 'default';
  });

  // Wrapper function that updates localStorage AND dispatches sync event
  const setBackground = useCallback((newBackground: BackgroundOption) => {
    setBackgroundState(newBackground);
    localStorage.setItem(STORAGE_KEY, newBackground);
    // Dispatch custom event for same-tab synchronization
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: newBackground }));
  }, []);

  // Listen for changes from other hook instances
  useEffect(() => {
    const handleSync = (event: CustomEvent<BackgroundOption>) => {
      setBackgroundState(event.detail);
    };

    window.addEventListener(SYNC_EVENT, handleSync as EventListener);
    return () => {
      window.removeEventListener(SYNC_EVENT, handleSync as EventListener);
    };
  }, []);

  return { background, setBackground };
}

// Background class mappings (unchanged)
export const backgroundClasses: Record<BackgroundOption, string> = {
  'default': 'bg-[#e5ddd5] dark:bg-slate-900',
  'solid-light': 'bg-gray-100 dark:bg-slate-900',
  'solid-dark': 'bg-gray-300 dark:bg-slate-800',
  'gradient': 'bg-gradient-to-b from-gray-100 to-gray-200 dark:from-slate-900 dark:to-slate-800',
  'pattern': 'bg-[#e5ddd5] dark:bg-slate-900 bg-chat-pattern',
};
```

---

### Hoe het werkt

```text
┌─────────────────────────────────┐
│ WhatsAppBackgroundPicker        │
│                                 │
│  setBackground('gradient')      │
│         │                       │
│         ├─→ localStorage.set()  │
│         └─→ dispatchEvent()     │
└─────────────────────────────────┘
                  │
                  │ CustomEvent: 'whatsapp-background-change'
                  ▼
┌─────────────────────────────────┐
│ WhatsAppChatDetail              │
│                                 │
│  addEventListener(SYNC_EVENT)   │
│         │                       │
│         └─→ setBackgroundState('gradient')
│                                 │
│  → Achtergrond verandert! ✓     │
└─────────────────────────────────┘
```

---

### Bestanden

| Bestand | Actie |
|---------|-------|
| `useWhatsAppBackground.ts` | Wijzig - custom event synchronisatie |

---

### Test Checklist

- [ ] Klik op achtergrond optie → achtergrond verandert direct
- [ ] Gradient optie toont gradient achtergrond
- [ ] Pattern optie toont dot pattern
- [ ] Keuze blijft behouden na page refresh
- [ ] Werkt correct in light en dark mode

