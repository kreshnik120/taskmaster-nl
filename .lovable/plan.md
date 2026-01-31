

## STAP 4.1: Dark Mode voor WhatsApp Chat

### Doel

Implementeer volledige dark mode support voor de WhatsApp chat interface, zodat alle elementen correct reageren op light/dark mode wisselingen.

---

### Overzicht Wijzigingen

| Component | Huidige Status | Wijziging |
|-----------|---------------|-----------|
| WhatsAppChatDetail.tsx | Hardcoded `bg-[#e5ddd5]` | Dark mode variant toevoegen |
| WhatsAppMessageBubble.tsx | Deels Tailwind tokens | Dark mode voor bubbles |
| WhatsAppChatItem.tsx | Gebruikt `bg-accent` | Verfijnen voor dark mode |
| WhatsAppLinkedBanner.tsx | Hardcoded WhatsApp groen | Behouden (werkt in beide modes) |
| WhatsAppStatusIcon.tsx | Gebruikt muted-foreground | Al compatible |

---

### Bestand 1: WhatsAppChatDetail.tsx

**Wijzigingen:**

1. **Chat achtergrond (regel 112):**
   ```tsx
   // Huidig:
   className="flex flex-col h-full bg-[#e5ddd5]"
   
   // Nieuw:
   className="flex flex-col h-full bg-[#e5ddd5] dark:bg-slate-900"
   ```

2. **Message input container (regel 261):**
   ```tsx
   // Huidig:
   className="p-4 bg-background border-t"
   
   // Nieuw (al correct - bg-background past zich aan):
   className="p-4 bg-background border-t"
   ```
   
   *Opmerking: `bg-background` is al een Tailwind CSS variabele die reageert op dark mode. Geen wijziging nodig.*

3. **Header (regel 124):**
   ```tsx
   // Huidig:
   className="flex items-center gap-3 px-4 py-3 bg-background border-b"
   
   // Al correct - bg-background en border-b gebruiken design tokens
   ```

---

### Bestand 2: WhatsAppMessageBubble.tsx

**Wijzigingen:**

1. **Outgoing message bubble (regel 48-54):**
   ```tsx
   // Huidig:
   className={cn(
     "max-w-[75%] px-3 py-2 rounded-2xl shadow-sm",
     isOutgoing 
       ? "bg-[#dcf8c6] rounded-br-none" 
       : "bg-background rounded-bl-none border border-border"
   )}
   
   // Nieuw:
   className={cn(
     "max-w-[75%] px-3 py-2 rounded-2xl shadow-sm",
     isOutgoing 
       ? "bg-[#dcf8c6] dark:bg-emerald-900 rounded-br-none text-foreground" 
       : "bg-white dark:bg-slate-800 rounded-bl-none border border-border text-foreground"
   )}
   ```

2. **Message body text (regel 121):**
   ```tsx
   // Huidig:
   className="text-sm text-foreground whitespace-pre-wrap break-words"
   
   // Al correct - text-foreground past zich aan
   ```

3. **Timestamp (regel 138):**
   ```tsx
   // Huidig:
   className="text-[10px] text-muted-foreground"
   
   // Al correct - text-muted-foreground past zich aan
   ```

4. **DateDivider component (regel 166):**
   ```tsx
   // Huidig:
   className="bg-muted/80 text-muted-foreground text-xs px-3 py-1 rounded-full shadow-sm"
   
   // Al correct - gebruikt design tokens
   ```

---

### Bestand 3: WhatsAppChatItem.tsx

**Wijzigingen:**

1. **Chat item container (regel 51-56):**
   ```tsx
   // Huidig:
   className={cn(
     "flex items-center gap-3 p-3 cursor-pointer transition-colors border-b border-border/50",
     "hover:bg-accent/50",
     isSelected && "bg-accent border-l-2 border-l-primary",
     isMuted && "opacity-60"
   )}
   
   // Nieuw - meer expliciete hover states:
   className={cn(
     "flex items-center gap-3 p-3 cursor-pointer transition-colors border-b border-border/50",
     "hover:bg-gray-50 dark:hover:bg-slate-800",
     isSelected && "bg-blue-50 dark:bg-blue-900/30 border-l-2 border-l-primary",
     isMuted && "opacity-60"
   )}
   ```

*Opmerking: De huidige `bg-accent` tokens werken al correct, maar we verfijnen voor betere contrast.*

---

### Bestand 4: WhatsAppLinkedBanner.tsx

**Status: Geen wijzigingen nodig**

De component gebruikt al:
- `bg-[#25D366]/10` - transparant groen, werkt in beide modes
- `text-muted-foreground` en `text-foreground` - design tokens
- WhatsApp groen `#25D366` moet consistent blijven voor branding

---

### Bestand 5: WhatsAppStatusIcon.tsx

**Status: Geen wijzigingen nodig**

De component gebruikt al:
- `text-muted-foreground` - past zich aan aan dark mode
- `text-[#53bdeb]` voor read status - WhatsApp blauw, consistent in beide modes

---

### Visueel Ontwerp

```text
LIGHT MODE                          DARK MODE
┌────────────────────────┐         ┌────────────────────────┐
│ Header (bg-background) │         │ Header (bg-slate-950)  │
├────────────────────────┤         ├────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│         │                        │
│ bg-[#e5ddd5]           │         │ bg-slate-900           │
│                        │         │                        │
│  ┌──────────────┐      │         │  ┌──────────────┐      │
│  │ Incoming     │      │         │  │ Incoming     │      │
│  │ bg-white     │      │         │  │ bg-slate-800 │      │
│  └──────────────┘      │         │  └──────────────┘      │
│                        │         │                        │
│      ┌──────────────┐  │         │      ┌──────────────┐  │
│      │ Outgoing     │  │         │      │ Outgoing     │  │
│      │ bg-[#dcf8c6] │  │         │      │ bg-emerald-  │  │
│      └──────────────┘  │         │      │ 900          │  │
│                        │         │      └──────────────┘  │
├────────────────────────┤         ├────────────────────────┤
│ Input (bg-background)  │         │ Input (bg-slate-950)   │
└────────────────────────┘         └────────────────────────┘
```

---

### Kleurenpalet

| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Chat achtergrond | `#e5ddd5` (WhatsApp classic) | `slate-900` |
| Outgoing bubble | `#dcf8c6` (WhatsApp groen) | `emerald-900` |
| Incoming bubble | `white` | `slate-800` |
| Bubble tekst | `foreground` | `foreground` |
| Timestamps | `muted-foreground` | `muted-foreground` |
| Selected chat item | `blue-50` | `blue-900/30` |
| Hover chat item | `gray-50` | `slate-800` |
| Unread badge | `#25D366` (consistent) | `#25D366` (consistent) |
| Read checkmarks | `#53bdeb` (consistent) | `#53bdeb` (consistent) |

---

### Technische Details

| Aspect | Implementatie |
|--------|---------------|
| Dark mode trigger | Tailwind `dark:` prefix |
| Design tokens | Gebruiken bestaande `bg-background`, `text-foreground`, etc. |
| WhatsApp branding | Kleuren `#25D366`, `#53bdeb`, `#dcf8c6` behouden |
| Contrast | WCAG AA compliant door Tailwind standaardwaarden |

---

### Bestanden Overzicht

| Bestand | Wijzigingen |
|---------|-------------|
| `WhatsAppChatDetail.tsx` | Dark mode voor chat achtergrond |
| `WhatsAppMessageBubble.tsx` | Dark mode voor bubbles |
| `WhatsAppChatItem.tsx` | Expliciete hover/selected states |
| `WhatsAppLinkedBanner.tsx` | Geen wijzigingen |
| `WhatsAppStatusIcon.tsx` | Geen wijzigingen |
| `WhatsAppFilterTabs.tsx` | Geen wijzigingen (gebruikt design tokens) |

---

### Test Checklist

- [ ] Toggle dark mode via browser/systeem instellingen
- [ ] Chat achtergrond verandert van beige naar donkergrijs
- [ ] Outgoing bubbles: groen in light, donkergroen in dark
- [ ] Incoming bubbles: wit in light, donkergrijs in dark
- [ ] Tekst leesbaar in beide modes
- [ ] Timestamps en status icons zichtbaar
- [ ] Chat header past zich aan
- [ ] Message input past zich aan
- [ ] Chat list hover/selected states correct
- [ ] WhatsApp groen (#25D366) consistent in beide modes
- [ ] Read checkmarks blauw (#53bdeb) in beide modes
- [ ] Geen contrast problemen (WCAG AA)

