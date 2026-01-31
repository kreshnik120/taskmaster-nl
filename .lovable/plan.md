

## STAP 2.3: Acties Integratie

### Doel

Voeg keyboard hints toe aan de Command Palette, implementeer "Koppel aan taak" feedback, en maak een help overlay voor alle keyboard shortcuts.

---

### Bestaande Onderdelen

| Component | Beschikbaar | Gebruik |
|-----------|-------------|---------|
| `CommandShortcut` | Ja | shadcn/ui component voor keyboard hints |
| `Dialog` | Ja | Voor help overlay |
| Taak koppeling | Nee | Nog niet geimplementeerd - toon toast feedback |

---

### Nieuw Bestand 1: WhatsAppKeyboardHelp.tsx

**Locatie:** `src/components/whatsapp/WhatsAppKeyboardHelp.tsx`

**Structuur:**
```text
Dialog (open/onOpenChange)
├── DialogContent
│   ├── DialogHeader
│   │   └── DialogTitle: "Keyboard Shortcuts"
│   │
│   ├── Sectie: ALGEMEEN
│   │   ├── ⌘K / Ctrl+K → Open command palette
│   │   ├── ⌘F / Ctrl+F → Focus zoekveld
│   │   └── ? → Toon deze help
│   │
│   ├── Sectie: NAVIGATIE
│   │   ├── ↑ ↓ → Navigeer door chats
│   │   ├── Enter → Open chat
│   │   ├── Escape → Ga terug / Sluit panel
│   │   └── i → Toggle profiel panel
│   │
│   └── Sectie: ACTIES (chat geselecteerd)
│       ├── ⌘P / Ctrl+P → Pin / Losmaken
│       ├── ⌘M / Ctrl+M → Mute / Demping opheffen
│       └── ⌘⇧A / Ctrl+Shift+A → Archiveren
```

**Keyboard hint component:**
```tsx
function KeyboardHint({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((key, i) => (
        <kbd 
          key={i}
          className="px-2 py-1 text-xs font-mono bg-muted rounded border"
        >
          {key}
        </kbd>
      ))}
    </div>
  );
}
```

**Props:**
```typescript
interface WhatsAppKeyboardHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

---

### Wijziging Bestand 2: WhatsAppCommandPalette.tsx

**Toevoegingen:**

1. **Importeer CommandShortcut:**
   ```typescript
   import {
     CommandDialog,
     CommandInput,
     CommandList,
     CommandEmpty,
     CommandGroup,
     CommandItem,
     CommandSeparator,
     CommandShortcut,  // <-- Toevoegen
   } from "@/components/ui/command";
   ```

2. **Importeer Link icon en toast:**
   ```typescript
   import { Link } from "lucide-react";
   import { toast } from "sonner";
   ```

3. **Voeg keyboard hints toe aan actie items:**

   Pin actie (regels 200-210):
   ```tsx
   <CommandItem
     value="pin-chat"
     onSelect={handlePinChat}
     disabled={!hasSelectedChat}
     className={cn(!hasSelectedChat && "opacity-50 cursor-not-allowed")}
   >
     <Pin className="mr-2 h-4 w-4" />
     <span>{selectedChat?.is_pinned ? "Losmaken" : "Pin"} huidige chat</span>
     <CommandShortcut>⌘P</CommandShortcut>  {/* <-- Toevoegen */}
   </CommandItem>
   ```

   Mute actie (regels 211-222):
   ```tsx
   <CommandItem
     value="mute-chat"
     onSelect={handleMuteChat}
     disabled={!hasSelectedChat}
     className={cn(!hasSelectedChat && "opacity-50 cursor-not-allowed")}
   >
     <BellOff className="mr-2 h-4 w-4" />
     <span>{selectedChat?.is_muted ? "Demping opheffen" : "Mute"} huidige chat</span>
     <CommandShortcut>⌘M</CommandShortcut>  {/* <-- Toevoegen */}
   </CommandItem>
   ```

   Archive actie (regels 223-231):
   ```tsx
   <CommandItem
     value="archive-chat"
     onSelect={handleArchiveChat}
     disabled={!hasSelectedChat}
     className={cn(!hasSelectedChat && "opacity-50 cursor-not-allowed")}
   >
     <Archive className="mr-2 h-4 w-4" />
     <span>Archiveer chat</span>
     <CommandShortcut>⌘⇧A</CommandShortcut>  {/* <-- Toevoegen */}
   </CommandItem>
   ```

4. **Voeg "Koppel aan taak" actie toe (na Archive):**
   ```tsx
   <CommandItem
     value="link-task"
     onSelect={() => {
       toast.info("Taakkoppeling komt in een latere fase");
       onOpenChange(false);
     }}
     disabled={!hasSelectedChat}
     className={cn(!hasSelectedChat && "opacity-50 cursor-not-allowed")}
   >
     <Link className="mr-2 h-4 w-4" />
     <span>Koppel aan taak</span>
   </CommandItem>
   ```

---

### Wijziging Bestand 3: WhatsApp.tsx

**Toevoegingen:**

1. **Importeer WhatsAppKeyboardHelp:**
   ```typescript
   import { WhatsAppKeyboardHelp } from "@/components/whatsapp/WhatsAppKeyboardHelp";
   ```

2. **Voeg state toe voor keyboard help:**
   ```typescript
   const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);
   ```

3. **Voeg "?" shortcut toe aan handleKeyDown (na input check):**
   ```typescript
   case '?':
     // ? requires Shift key (Shift+/ = ?)
     e.preventDefault();
     setKeyboardHelpOpen(true);
     break;
   ```

4. **Render WhatsAppKeyboardHelp component:**
   ```tsx
   <WhatsAppKeyboardHelp
     open={keyboardHelpOpen}
     onOpenChange={setKeyboardHelpOpen}
   />
   ```

---

### Visueel Ontwerp - Keyboard Help Modal

```text
┌─────────────────────────────────────────────────┐
│  ⌨️  Keyboard Shortcuts                    [X]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  ALGEMEEN                                       │
│  ┌────────┐                                     │
│  │ ⌘  K  │  Open command palette               │
│  └────────┘                                     │
│  ┌────────┐                                     │
│  │ ⌘  F  │  Focus zoekveld                     │
│  └────────┘                                     │
│  ┌────────┐                                     │
│  │   ?   │  Toon deze help                     │
│  └────────┘                                     │
│                                                 │
│  NAVIGATIE                                      │
│  ┌────────┐                                     │
│  │ ↑  ↓  │  Navigeer door chats                │
│  └────────┘                                     │
│  ┌────────┐                                     │
│  │ Enter │  Open geselecteerde chat            │
│  └────────┘                                     │
│  ┌────────┐                                     │
│  │  Esc  │  Ga terug / Sluit panel             │
│  └────────┘                                     │
│  ┌────────┐                                     │
│  │   i   │  Toggle profiel panel               │
│  └────────┘                                     │
│                                                 │
│  ACTIES (chat geselecteerd)                     │
│  ┌────────┐                                     │
│  │ ⌘  P  │  Pin / Losmaken                     │
│  └────────┘                                     │
│  ┌────────┐                                     │
│  │ ⌘  M  │  Mute / Demping opheffen            │
│  └────────┘                                     │
│  ┌────────┐                                     │
│  │ ⌘ ⇧ A │  Archiveren                         │
│  └────────┘                                     │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

### Technische Details

| Aspect | Implementatie |
|--------|---------------|
| `CommandShortcut` | Bestaand shadcn/ui component, auto-positioned rechts |
| Platform detectie | Toon ⌘ op Mac, Ctrl op Windows/Linux |
| "?" key | Werkt alleen buiten inputs (na input check) |
| Koppel aan taak | Toast feedback, niet disabled |
| Dialog closing | Escape of click buiten |

---

### Platform-Aware Keyboard Hints

Detecteer platform en toon correcte symbolen:

```typescript
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

const shortcuts = {
  commandPalette: isMac ? '⌘K' : 'Ctrl+K',
  search: isMac ? '⌘F' : 'Ctrl+F',
  pin: isMac ? '⌘P' : 'Ctrl+P',
  mute: isMac ? '⌘M' : 'Ctrl+M',
  archive: isMac ? '⌘⇧A' : 'Ctrl+Shift+A',
};
```

---

### Flow Diagram

```text
┌─────────────────────────────────────────────────────────────┐
│                    WhatsApp.tsx                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  State:                                                      │
│  ├── commandPaletteOpen                                     │
│  └── keyboardHelpOpen     <── NIEUW                         │
│                                                              │
│  handleKeyDown:                                              │
│  ├── Cmd+K → setCommandPaletteOpen(true)                    │
│  ├── Cmd+F → focus search input                             │
│  ├── ? → setKeyboardHelpOpen(true)  <── NIEUW               │
│  └── ... andere shortcuts                                   │
│                                                              │
│  Render:                                                     │
│  ├── WhatsAppCommandPalette (met keyboard hints)            │
│  └── WhatsAppKeyboardHelp   <── NIEUW                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### Bestanden Overzicht

| Bestand | Actie | Beschrijving |
|---------|-------|--------------|
| `WhatsAppKeyboardHelp.tsx` | Nieuw | Help overlay component |
| `WhatsAppCommandPalette.tsx` | Wijzig | Keyboard hints + Link aan taak |
| `WhatsApp.tsx` | Wijzig | "?" shortcut + render help dialog |

---

### Test Checklist

- [ ] Keyboard hints zichtbaar naast actie items in Command Palette
- [ ] CommandShortcut toont ⌘P, ⌘M, ⌘⇧A
- [ ] "?" opent keyboard help overlay
- [ ] Help overlay toont alle shortcuts in categorieën
- [ ] Escape sluit help overlay
- [ ] Klik buiten modal sluit help overlay
- [ ] "Koppel aan taak" toont toast "Taakkoppeling komt in een latere fase"
- [ ] Platform-aware hints (⌘ op Mac, Ctrl op Windows)

