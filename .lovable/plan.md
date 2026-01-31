

## Subtiele Verfijningen: Achtergrond Customization

### Overzicht

Dit plan implementeert vier verfijningen voor een gepolijstere gebruikerservaring:

1. **Fade transition** bij achtergrond wissel
2. **Auto-close popover** na selectie
3. **3 extra kleuropties** (Mint, Blue, Peach)
4. **Transparantere date dividers**

---

### Wijziging 1: Fade Transition

**Bestand:** `src/hooks/whatsapp/useWhatsAppBackground.ts`

Voeg `transition-colors duration-300` toe aan alle backgroundClasses zodat de achtergrond vloeiend overgaat:

```typescript
export const backgroundClasses: Record<BackgroundOption, string> = {
  'default': 'bg-[#e5ddd5] dark:bg-slate-900 transition-colors duration-300',
  'solid-light': 'bg-gray-100 dark:bg-slate-900 transition-colors duration-300',
  'solid-dark': 'bg-gray-300 dark:bg-slate-800 transition-colors duration-300',
  'gradient': 'bg-gradient-to-b from-gray-100 to-gray-200 dark:from-slate-900 dark:to-slate-800 transition-all duration-300',
  'pattern': 'bg-[#e5ddd5] dark:bg-slate-900 bg-chat-pattern transition-colors duration-300',
  // + nieuwe kleuren...
};
```

---

### Wijziging 2: Auto-Close Popover

**Bestand:** `src/components/whatsapp/WhatsAppBackgroundPicker.tsx`

Voeg `open` state toe en sluit de popover automatisch na selectie:

```typescript
export function WhatsAppBackgroundPicker() {
  const { background, setBackground } = useWhatsAppBackground();
  const [open, setOpen] = useState(false);
  
  const handleSelect = (option: BackgroundOption) => {
    setBackground(option);
    setOpen(false); // Auto-close na selectie
  };
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* ... */}
      <button onClick={() => handleSelect(option.id)}>
```

---

### Wijziging 3: Extra Kleuropties

**Bestand:** `src/hooks/whatsapp/useWhatsAppBackground.ts`

Breid het type en de classes uit met drie nieuwe opties:

```typescript
export type BackgroundOption = 
  | 'default' 
  | 'solid-light' 
  | 'solid-dark' 
  | 'gradient' 
  | 'pattern'
  | 'mint'      // NIEUW
  | 'blue'      // NIEUW  
  | 'peach';    // NIEUW

export const backgroundClasses: Record<BackgroundOption, string> = {
  // bestaande...
  'mint': 'bg-emerald-100 dark:bg-emerald-950 transition-colors duration-300',
  'blue': 'bg-sky-100 dark:bg-sky-950 transition-colors duration-300',
  'peach': 'bg-orange-100 dark:bg-orange-950 transition-colors duration-300',
};
```

**Bestand:** `src/components/whatsapp/WhatsAppBackgroundPicker.tsx`

Voeg de nieuwe opties toe aan de picker:

```typescript
const backgroundOptions: BackgroundOptionConfig[] = [
  // bestaande opties...
  { 
    id: 'mint', 
    name: 'Mint', 
    lightPreview: '#d1fae5',  // emerald-100
    darkPreview: '#022c22'    // emerald-950
  },
  { 
    id: 'blue', 
    name: 'Hemelsblauw', 
    lightPreview: '#e0f2fe',  // sky-100
    darkPreview: '#082f49'    // sky-950
  },
  { 
    id: 'peach', 
    name: 'Perzik', 
    lightPreview: '#ffedd5',  // orange-100
    darkPreview: '#431407'    // orange-950
  },
];
```

Update grid naar 4 kolommen voor betere layout met 8 opties:

```typescript
<div className="grid grid-cols-4 gap-2">
```

---

### Wijziging 4: Transparantere Date Dividers

**Bestand:** `src/components/whatsapp/WhatsAppMessageBubble.tsx`

Maak de DateDivider semi-transparant zodat de achtergrond erdoorheen schijnt:

```typescript
export function DateDivider({ label }: DateDividerProps) {
  return (
    <div className="flex items-center justify-center my-4">
      <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm text-muted-foreground text-xs px-3 py-1 rounded-full shadow-sm">
        {label}
      </div>
    </div>
  );
}
```

**Veranderingen:**
- `bg-muted/80` → `bg-white/60 dark:bg-slate-800/60`
- Toegevoegd: `backdrop-blur-sm` voor subtiel blur effect

---

### Bestanden Overzicht

| Bestand | Wijzigingen |
|---------|-------------|
| `useWhatsAppBackground.ts` | + 3 nieuwe kleuren, + transition classes |
| `WhatsAppBackgroundPicker.tsx` | + useState voor open, + auto-close, + 3 nieuwe opties, grid 4 cols |
| `WhatsAppMessageBubble.tsx` | DateDivider transparanter + backdrop-blur |

---

### Visueel Resultaat

```text
┌────────────────────────────────────┐
│ Achtergrond Picker (4 kolommen)    │
├────┬────┬────┬────┐                │
│ 🟤 │ ⬜ │ ⬛ │ 🔲 │ ← rij 1        │
├────┼────┼────┼────┤                │
│ 📐 │ 🟢 │ 🔵 │ 🟠 │ ← rij 2        │
└────┴────┴────┴────┘                │
│ Classic│Light│Dark│Grad│Dot│Mint│Blue│Peach
└────────────────────────────────────┘

Date Divider (voor vs na):
┌─────────────────────────────────┐
│ VOOR: bg-muted/80 (ondoorzichtig)
│       ┌──────────────┐
│       │  Vandaag     │ ← solide achtergrond
│       └──────────────┘
│
│ NA: bg-white/60 + backdrop-blur
│       ┌──────────────┐
│       │  Vandaag     │ ← achtergrond schijnt door
│       └──────────────┘
└─────────────────────────────────┘
```

---

### Test Checklist

- [ ] Klik op achtergrond → vloeiende fade transition (300ms)
- [ ] Popover sluit automatisch na selectie
- [ ] Mint achtergrond toont lichtgroen (light) / donkergroen (dark)
- [ ] Blue achtergrond toont lichtblauw (light) / donkerblauw (dark)
- [ ] Peach achtergrond toont licht oranje (light) / donker oranje (dark)
- [ ] Date dividers zijn semi-transparant met blur effect
- [ ] Grid toont 4 kolommen en alle 8 opties zijn zichtbaar

