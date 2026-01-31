

## STAP 4.3: Chat Achtergrond Customization

### Doel

Voeg de mogelijkheid toe om de chat achtergrond aan te passen met 5 verschillende opties, opgeslagen in localStorage voor persistentie.

---

### Overzicht Wijzigingen

| Bestand | Actie | Beschrijving |
|---------|-------|--------------|
| `useWhatsAppBackground.ts` | Nieuw | Hook voor achtergrond state + localStorage |
| `WhatsAppBackgroundPicker.tsx` | Nieuw | UI component voor achtergrond selectie |
| `WhatsAppChatDetail.tsx` | Wijzig | Integratie van achtergrond hook |
| `src/index.css` | Wijzig | CSS pattern class toevoegen |

---

### Nieuw Bestand 1: useWhatsAppBackground.ts

**Locatie:** `src/hooks/whatsapp/useWhatsAppBackground.ts`

```typescript
import { useState, useEffect } from 'react';

export type BackgroundOption = 'default' | 'solid-light' | 'solid-dark' | 'gradient' | 'pattern';

const STORAGE_KEY = 'whatsapp-background';

export function useWhatsAppBackground() {
  const [background, setBackground] = useState<BackgroundOption>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(STORAGE_KEY) as BackgroundOption) || 'default';
    }
    return 'default';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, background);
  }, [background]);

  return { background, setBackground };
}

// Background class mappings for use in components
export const backgroundClasses: Record<BackgroundOption, string> = {
  'default': 'bg-[#e5ddd5] dark:bg-slate-900',
  'solid-light': 'bg-gray-100 dark:bg-slate-900',
  'solid-dark': 'bg-gray-300 dark:bg-slate-800',
  'gradient': 'bg-gradient-to-b from-gray-100 to-gray-200 dark:from-slate-900 dark:to-slate-800',
  'pattern': 'bg-[#e5ddd5] dark:bg-slate-900 bg-chat-pattern',
};
```

---

### Nieuw Bestand 2: WhatsAppBackgroundPicker.tsx

**Locatie:** `src/components/whatsapp/WhatsAppBackgroundPicker.tsx`

**Structuur:**

```text
Popover
├── PopoverTrigger (Palette button in header)
└── PopoverContent
    ├── Title: "Achtergrond"
    └── Grid (3 columns)
        ├── Default (WhatsApp Classic)
        ├── Solid Light
        ├── Solid Dark
        ├── Gradient
        └── Pattern (Doodle)
```

**Component details:**

```tsx
import { Palette, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useWhatsAppBackground, BackgroundOption } from "@/hooks/whatsapp/useWhatsAppBackground";

interface BackgroundOptionConfig {
  id: BackgroundOption;
  name: string;
  lightPreview: string;
  darkPreview: string;
}

const backgroundOptions: BackgroundOptionConfig[] = [
  { 
    id: 'default', 
    name: 'WhatsApp Classic', 
    lightPreview: '#e5ddd5',
    darkPreview: '#0f172a'
  },
  { 
    id: 'solid-light', 
    name: 'Lichtgrijs', 
    lightPreview: '#f3f4f6',
    darkPreview: '#0f172a'
  },
  { 
    id: 'solid-dark', 
    name: 'Donkergrijs', 
    lightPreview: '#d1d5db',
    darkPreview: '#1e293b'
  },
  { 
    id: 'gradient', 
    name: 'Gradient', 
    lightPreview: 'linear-gradient(to bottom, #f3f4f6, #e5e7eb)',
    darkPreview: 'linear-gradient(to bottom, #0f172a, #1e293b)'
  },
  { 
    id: 'pattern', 
    name: 'Doodle', 
    lightPreview: '#e5ddd5',
    darkPreview: '#0f172a'
  },
];

export function WhatsAppBackgroundPicker() {
  const { background, setBackground } = useWhatsAppBackground();
  const isDark = document.documentElement.classList.contains('dark');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          aria-label="Kies achtergrond"
        >
          <Palette className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52">
        <p className="text-sm font-medium mb-3">Achtergrond</p>
        <div className="grid grid-cols-3 gap-2">
          {backgroundOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => setBackground(option.id)}
              className={cn(
                "w-14 h-14 rounded-lg border-2 transition-all relative overflow-hidden",
                "hover:scale-105",
                background === option.id 
                  ? "border-primary ring-2 ring-primary/20" 
                  : "border-border hover:border-primary/50"
              )}
              style={{ 
                background: isDark ? option.darkPreview : option.lightPreview 
              }}
              title={option.name}
              aria-label={`Selecteer ${option.name} achtergrond`}
              aria-pressed={background === option.id}
            >
              {/* Pattern overlay for doodle option */}
              {option.id === 'pattern' && (
                <div 
                  className="absolute inset-0 opacity-30"
                  style={{
                    backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.15) 1px, transparent 1px)',
                    backgroundSize: '8px 8px'
                  }}
                />
              )}
              
              {/* Checkmark for selected */}
              {background === option.id && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Check className="h-5 w-5 text-white drop-shadow" />
                </div>
              )}
            </button>
          ))}
        </div>
        
        {/* Option name display */}
        <p className="text-xs text-muted-foreground mt-2 text-center">
          {backgroundOptions.find(o => o.id === background)?.name}
        </p>
      </PopoverContent>
    </Popover>
  );
}
```

---

### Wijziging Bestand 3: src/index.css

**Toevoegen na regel 189 (na reduced motion styles):**

```css
/* WhatsApp chat background pattern */
.bg-chat-pattern {
  background-image: radial-gradient(circle, rgba(0, 0, 0, 0.04) 1px, transparent 1px);
  background-size: 20px 20px;
}

.dark .bg-chat-pattern {
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
}
```

---

### Wijziging Bestand 4: WhatsAppChatDetail.tsx

**1. Import toevoegen (regel 3):**
```typescript
import { Palette } from "lucide-react";
```

**2. Import hook en picker (na regel 21):**
```typescript
import { useWhatsAppBackground, backgroundClasses } from "@/hooks/whatsapp/useWhatsAppBackground";
import { WhatsAppBackgroundPicker } from "./WhatsAppBackgroundPicker";
```

**3. Hook gebruiken in component (na regel 45):**
```typescript
// Background customization
const { background } = useWhatsAppBackground();
```

**4. Achtergrond class toepassen (regel 112):**
```tsx
// Huidig:
<div className="flex flex-col h-full bg-[#e5ddd5] dark:bg-slate-900">

// Nieuw:
<div className={cn("flex flex-col h-full", backgroundClasses[background])}>
```

**5. Picker toevoegen in header actions (regel 160-170, voor showProfileButton):**
```tsx
<div className="flex items-center gap-1">
  {/* Background picker */}
  <WhatsAppBackgroundPicker />
  
  {showProfileButton && (
    // ... existing code
  )}
```

---

### Visueel Ontwerp - Background Picker

```text
┌─────────────────────────────────┐
│ [Palette Icon Button]           │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Achtergrond                    │
│                                 │
│  ┌────┐  ┌────┐  ┌────┐        │
│  │    │  │    │  │    │        │
│  │ ✓  │  │    │  │    │        │
│  │    │  │    │  │    │        │
│  └────┘  └────┘  └────┘        │
│  Default  Light   Dark          │
│                                 │
│  ┌────┐  ┌────┐                 │
│  │≡≡≡≡│  │ ·· │                 │
│  │≡≡≡≡│  │ ·· │                 │
│  │≡≡≡≡│  │ ·· │                 │
│  └────┘  └────┘                 │
│  Gradient Pattern               │
│                                 │
│        WhatsApp Classic         │
└─────────────────────────────────┘
```

---

### Achtergrond Opties Overzicht

| ID | Naam | Light Mode | Dark Mode |
|----|------|------------|-----------|
| `default` | WhatsApp Classic | `#e5ddd5` (beige) | `slate-900` |
| `solid-light` | Lichtgrijs | `gray-100` | `slate-900` |
| `solid-dark` | Donkergrijs | `gray-300` | `slate-800` |
| `gradient` | Gradient | `gray-100 → gray-200` | `slate-900 → slate-800` |
| `pattern` | Doodle | `#e5ddd5` + dots | `slate-900` + dots |

---

### Technische Details

| Aspect | Implementatie |
|--------|---------------|
| State management | React useState + localStorage |
| Persistentie | localStorage key: `whatsapp-background` |
| Dark mode | Automatische aanpassing via Tailwind `dark:` prefix |
| Pattern | CSS radial-gradient (performant, geen SVG) |
| Preview thumbnails | Inline styles voor exacte kleurweergave |

---

### Data Flow

```text
┌─────────────────────────────────────────────────────────────┐
│                    localStorage                             │
│              key: 'whatsapp-background'                     │
│                    value: 'default'                         │
└─────────────────────┬───────────────────────────────────────┘
                      │ read/write
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              useWhatsAppBackground()                        │
│                                                             │
│   const { background, setBackground } = ...                 │
│                                                             │
└──────────────┬───────────────────────┬──────────────────────┘
               │                       │
               ▼                       ▼
┌──────────────────────────┐ ┌─────────────────────────────────┐
│ WhatsAppBackgroundPicker │ │     WhatsAppChatDetail          │
│                          │ │                                 │
│  - Show current selection│ │  - Apply backgroundClasses      │
│  - Handle selection      │ │  - Dynamic className            │
└──────────────────────────┘ └─────────────────────────────────┘
```

---

### Bestanden Overzicht

| Bestand | Actie | Beschrijving |
|---------|-------|--------------|
| `useWhatsAppBackground.ts` | Nieuw | Hook + backgroundClasses mapping |
| `WhatsAppBackgroundPicker.tsx` | Nieuw | Popover met achtergrond opties |
| `WhatsAppChatDetail.tsx` | Wijzig | Integratie hook + picker in header |
| `src/index.css` | Wijzig | CSS pattern class |

---

### Test Checklist

- [ ] Achtergrond selector zichtbaar in chat header (Palette icon)
- [ ] Popover opent bij klik op icon
- [ ] Alle 5 opties tonen correcte preview thumbnails
- [ ] Klikken op optie wijzigt achtergrond direct
- [ ] Checkmark toont bij geselecteerde optie
- [ ] Achtergrond blijft behouden na page refresh (localStorage)
- [ ] Achtergrond werkt correct in light mode
- [ ] Achtergrond werkt correct in dark mode
- [ ] Pattern optie toont subtiel dot patroon
- [ ] Gradient optie toont smooth overgang
- [ ] Popover sluit na selectie of klik buiten
- [ ] Aria labels correct voor screen readers
- [ ] Geen performance impact (CSS-only patterns)

