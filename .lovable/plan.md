

## STAP 4.2: Micro-animaties voor WhatsApp Chat

### Doel

Voeg subtiele micro-animaties toe aan de WhatsApp chat interface voor een betere gebruikerservaring. De animaties moeten subtiel zijn, niet afleidend, en respecteren de `prefers-reduced-motion` instelling.

---

### Overzicht Wijzigingen

| Component | Animatie | Beschrijving |
|-----------|----------|--------------|
| WhatsAppMessageBubble.tsx | Message send/receive | Scale+fade voor nieuwe berichten |
| WhatsAppStatusIcon.tsx | Status transitions | Color fade + pulse bij read status |
| WhatsAppChatItem.tsx | List transitions | Smooth hover + unread badge animatie |
| WhatsAppChatDetail.tsx | Input focus | Ring animatie bij focus |
| tailwind.config.ts | Custom keyframes | Nieuwe animatie definities |
| src/index.css | Utility classes | prefers-reduced-motion support |

---

### Bestand 1: tailwind.config.ts

**Toevoegen aan keyframes (regel 98-134):**

```typescript
// Nieuwe keyframes
"message-send": {
  "0%": { 
    opacity: "0", 
    transform: "scale(0.95) translateY(10px)" 
  },
  "100%": { 
    opacity: "1", 
    transform: "scale(1) translateY(0)" 
  }
},
"message-receive": {
  "0%": { 
    opacity: "0", 
    transform: "translateY(20px)" 
  },
  "100%": { 
    opacity: "1", 
    transform: "translateY(0)" 
  }
},
"pulse-once": {
  "0%, 100%": { opacity: "1" },
  "50%": { opacity: "0.6" }
},
"badge-pop": {
  "0%": { transform: "scale(0)" },
  "50%": { transform: "scale(1.15)" },
  "100%": { transform: "scale(1)" }
}
```

**Toevoegen aan animation (regel 135-140):**

```typescript
"message-send": "message-send 0.2s ease-out",
"message-receive": "message-receive 0.3s ease-out",
"pulse-once": "pulse-once 0.5s ease-in-out",
"badge-pop": "badge-pop 0.3s ease-out"
```

---

### Bestand 2: src/index.css

**Toevoegen voor prefers-reduced-motion support (aan einde van bestand):**

```css
/* Respecteer reduced motion voorkeur */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

### Bestand 3: WhatsAppMessageBubble.tsx

**Wijzigingen:**

1. **Import toevoegen:**
   ```typescript
   import { useState, useEffect } from "react";
   import { parseISO, differenceInSeconds } from "date-fns";
   ```

2. **Detectie van nieuwe berichten (binnen component, voor return):**
   ```typescript
   // Check if message is recently sent/received (within 2 seconds)
   const [isNew, setIsNew] = useState(() => {
     const sentAt = parseISO(message.sent_at);
     return differenceInSeconds(new Date(), sentAt) < 2;
   });
   
   // Remove "new" state after animation completes
   useEffect(() => {
     if (isNew) {
       const timer = setTimeout(() => setIsNew(false), 500);
       return () => clearTimeout(timer);
     }
   }, [isNew]);
   ```

3. **Animatie classes toevoegen aan bubble container (regel 48-54):**
   ```tsx
   <div
     className={cn(
       "max-w-[75%] px-3 py-2 rounded-2xl shadow-sm",
       isOutgoing 
         ? "bg-[#dcf8c6] dark:bg-emerald-900 rounded-br-none text-foreground" 
         : "bg-white dark:bg-slate-800 rounded-bl-none border border-border text-foreground",
       // Animation classes
       isNew && isOutgoing && "animate-message-send",
       isNew && !isOutgoing && "animate-message-receive"
     )}
   >
   ```

---

### Bestand 4: WhatsAppStatusIcon.tsx

**Wijzigingen:**

1. **Transition classes toevoegen aan alle icons:**
   ```tsx
   const iconClass = cn(
     "h-3.5 w-3.5 transition-colors duration-300",
     className
   );
   ```

2. **Pulse animatie voor read status (regel 26):**
   ```tsx
   case 'read':
     return <CheckCheck className={cn(iconClass, "text-[#53bdeb] animate-pulse-once")} />;
   ```

**Volledige nieuwe implementatie:**

```tsx
import { Check, CheckCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageStatus } from "@/types/whatsapp";

interface WhatsAppStatusIconProps {
  status: MessageStatus;
  className?: string;
}

export function WhatsAppStatusIcon({ status, className }: WhatsAppStatusIconProps) {
  // No icon for received messages (incoming)
  if (status === 'received') {
    return null;
  }

  const iconClass = cn(
    "h-3.5 w-3.5 transition-colors duration-300",
    className
  );

  switch (status) {
    case 'pending':
      return <Clock className={cn(iconClass, "text-muted-foreground")} />;
    case 'sent':
      return <Check className={cn(iconClass, "text-muted-foreground")} />;
    case 'delivered':
      return <CheckCheck className={cn(iconClass, "text-muted-foreground")} />;
    case 'read':
      return <CheckCheck className={cn(iconClass, "text-[#53bdeb] animate-pulse-once")} />;
    default:
      return null;
  }
}
```

---

### Bestand 5: WhatsAppChatItem.tsx

**Wijzigingen:**

1. **Chat item container - smooth transitions (regel 51-56):**
   ```tsx
   className={cn(
     "flex items-center gap-3 p-3 cursor-pointer border-b border-border/50",
     "transition-all duration-150 ease-in-out",  // <-- Verbeterd
     "hover:bg-gray-50 dark:hover:bg-slate-800",
     isSelected && "bg-blue-50 dark:bg-blue-900/30 border-l-2 border-l-primary",
     isMuted && "opacity-60"
   )}
   ```

2. **Unread badge met pop animatie (regel 129-134):**
   ```tsx
   {hasUnread && (
     <Badge 
       className={cn(
         "h-5 min-w-5 px-1.5 text-xs bg-[#25D366] text-white hover:bg-[#25D366] flex-shrink-0",
         "animate-badge-pop"
       )}
     >
       {chat.unread_count > 99 ? '99+' : chat.unread_count}
     </Badge>
   )}
   ```

3. **Pin icon met transition (regel 79-81):**
   ```tsx
   {isPinned && (
     <Pin className="h-3 w-3 text-muted-foreground flex-shrink-0 transition-transform duration-200" />
   )}
   ```

---

### Bestand 6: WhatsAppChatDetail.tsx

**Wijziging - Input focus animatie (regel 263-272):**

```tsx
<Input
  ref={inputRef}
  placeholder="Typ een bericht..."
  value={inputText}
  onChange={(e) => setInputText(e.target.value)}
  onKeyDown={handleKeyDown}
  disabled={sendMessage.isPending}
  className="flex-1 transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary"
  aria-label="Typ een bericht"
/>
```

---

### Visueel Diagram - Animatie Timing

```text
MESSAGE SEND ANIMATIE
────────────────────────────────────
   0ms                    200ms
    ├──────────────────────┤
    │                      │
    │  scale: 0.95 → 1.0   │
    │  opacity: 0 → 1      │
    │  translateY: 10px → 0│
    │                      │
    └──────────────────────┘
         ease-out

MESSAGE RECEIVE ANIMATIE
────────────────────────────────────
   0ms                         300ms
    ├─────────────────────────────┤
    │                             │
    │  opacity: 0 → 1             │
    │  translateY: 20px → 0       │
    │                             │
    └─────────────────────────────┘
         ease-out

STATUS PULSE ANIMATIE
────────────────────────────────────
   0ms        250ms          500ms
    ├──────────┼──────────────┤
    │          │              │
    │ opacity  │  opacity     │
    │   1      │    0.6       │ opacity 1
    │          │              │
    └──────────┴──────────────┘
         ease-in-out
```

---

### Technische Details

| Aspect | Implementatie |
|--------|---------------|
| Animatie library | Geen - pure CSS/Tailwind |
| Reduced motion | Media query in index.css |
| Performance | CSS transforms (GPU accelerated) |
| New message detection | Timestamp vergelijking < 2 sec |
| Animation cleanup | useEffect timer na 500ms |

---

### Animatie Classes Overzicht

| Class | Duur | Easing | Gebruik |
|-------|------|--------|---------|
| `animate-message-send` | 200ms | ease-out | Verzonden berichten |
| `animate-message-receive` | 300ms | ease-out | Ontvangen berichten |
| `animate-pulse-once` | 500ms | ease-in-out | Read status icon |
| `animate-badge-pop` | 300ms | ease-out | Unread badge |
| `transition-all duration-150` | 150ms | ease-in-out | Chat item hover |
| `transition-all duration-200` | 200ms | - | Input focus |

---

### Bestanden Overzicht

| Bestand | Actie | Wijzigingen |
|---------|-------|-------------|
| `tailwind.config.ts` | Wijzig | 4 nieuwe keyframes + animations |
| `src/index.css` | Wijzig | Reduced motion media query |
| `WhatsAppMessageBubble.tsx` | Wijzig | isNew state + animatie classes |
| `WhatsAppStatusIcon.tsx` | Wijzig | Transition + pulse animatie |
| `WhatsAppChatItem.tsx` | Wijzig | Smooth transitions + badge pop |
| `WhatsAppChatDetail.tsx` | Wijzig | Input focus ring |

---

### Test Checklist

- [ ] Verstuur bericht → ziet scale+fade animatie (0.2s)
- [ ] Ontvang nieuw bericht → ziet slide-in animatie (0.3s)
- [ ] Status verandert naar read → ziet kleur transitie + pulse
- [ ] Hover over chat item → smooth transition (0.15s)
- [ ] Focus input veld → ziet ring animatie
- [ ] Animaties zijn subtiel, niet afleidend
- [ ] Performance: geen jank of stutter (test met 6x slowdown)
- [ ] Test met prefers-reduced-motion: reduce → geen animaties
- [ ] Badge verschijnt met pop animatie

