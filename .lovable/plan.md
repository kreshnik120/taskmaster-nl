

## Command Palette voor WhatsApp Pagina

### Overzicht

Implementeer een Command Palette die opent met Cmd+K/Ctrl+K voor snelle navigatie en acties binnen de WhatsApp module.

---

### Bestaande Onderdelen (Geen wijzigingen nodig)

| Component | Locatie | Gebruik |
|-----------|---------|---------|
| `cmdk` library | package.json | Al geinstalleerd (^1.1.1) |
| Command components | `src/components/ui/command.tsx` | CommandDialog, CommandInput, CommandGroup, etc. |
| Chat status hook | `src/hooks/whatsapp/useUpdateChatStatus.ts` | Pin/Mute/Archive acties |
| Filter types | `src/types/whatsapp.ts` | WhatsAppFilter type |

---

### Nieuw Bestand 1: WhatsAppCommandPalette.tsx

**Locatie:** `src/components/whatsapp/WhatsAppCommandPalette.tsx`

**Props Interface:**
```typescript
interface WhatsAppCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chats: WhatsAppChat[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onFilterChange: (filter: WhatsAppFilter) => void;
  currentFilter: WhatsAppFilter;
}
```

**Structuur:**
```text
CommandDialog (open/onOpenChange)
├── CommandInput (placeholder="Zoek chats, acties...")
├── CommandList
│   ├── CommandEmpty ("Geen resultaten gevonden")
│   │
│   ├── CommandGroup heading="Chats"
│   │   └── [Dynamische lijst van chats]
│   │       ├── CommandItem: [Avatar] [Naam] [Preview]
│   │       └── onSelect → navigeer naar chat
│   │
│   ├── CommandGroup heading="Acties"
│   │   ├── CommandItem: "Pin huidige chat" (Pin icon)
│   │   ├── CommandItem: "Mute huidige chat" (BellOff icon)
│   │   ├── CommandItem: "Archiveer chat" (Archive icon)
│   │   └── [Disabled wanneer geen chat geselecteerd]
│   │
│   ├── CommandGroup heading="Filters"
│   │   ├── CommandItem: "Toon alle chats"
│   │   ├── CommandItem: "Toon ongelezen"
│   │   ├── CommandItem: "Toon gekoppelde"
│   │   └── onSelect → setFilter + close palette
│   │
│   └── CommandGroup heading="Navigatie"
│       ├── CommandItem: "Ga naar Professionals" → /professionals
│       ├── CommandItem: "Ga naar Klanten" → /klanten
│       └── CommandItem: "Ga naar Plaatsingen" → /plaatsingen
```

---

### Wijziging Bestand 2: WhatsApp.tsx

**Toevoegingen:**

1. **State voor palette:**
   ```typescript
   const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
   ```

2. **Keyboard shortcut Cmd+K/Ctrl+K:**
   ```typescript
   // Voeg toe aan bestaande handleKeyDown
   case 'k':
     if (e.metaKey || e.ctrlKey) {
       e.preventDefault();
       setCommandPaletteOpen(true);
     }
     break;
   ```

3. **Render component:**
   ```typescript
   <WhatsAppCommandPalette
     open={commandPaletteOpen}
     onOpenChange={setCommandPaletteOpen}
     chats={filteredChats}
     selectedChatId={selectedChatId}
     onSelectChat={handleSelectChat}
     onFilterChange={setFilter}
     currentFilter={filter}
   />
   ```

---

### Technische Details

| Aspect | Implementatie |
|--------|---------------|
| Dialog styling | Gebruikt bestaande CommandDialog van shadcn/ui |
| Keyboard trap | Automatisch door radix-ui Dialog |
| Escape sluiten | Automatisch door CommandDialog |
| Zoek filtering | Automatisch door cmdk |
| Pijltjes navigatie | Automatisch door cmdk |
| Animatie | Via shadcn Dialog (scale + fade) |

---

### Acties Logica

**Chat Acties (in palette):**

```typescript
const updateStatus = useUpdateChatStatus();

const handlePinCurrentChat = () => {
  if (!selectedChatId || !selectedChat) return;
  updateStatus.mutate({
    chatId: selectedChatId,
    field: 'is_pinned',
    value: !selectedChat.is_pinned,
  });
  onOpenChange(false);
};
```

**Navigatie Acties:**

```typescript
const navigate = useNavigate();

const navigationItems = [
  { label: 'Ga naar Professionals', path: '/professionals', icon: Users },
  { label: 'Ga naar Klanten', path: '/klanten', icon: Building2 },
  { label: 'Ga naar Plaatsingen', path: '/plaatsingen', icon: Briefcase },
];
```

---

### Visueel Ontwerp

```text
┌─────────────────────────────────────────────────┐
│ 🔍 Zoek chats, acties...                        │
├─────────────────────────────────────────────────┤
│                                                 │
│  CHATS                                          │
│  ┌─────────────────────────────────────────┐   │
│  │ 👤 Jan de Vries                         │   │
│  │    Bedankt voor je bericht...           │   │
│  └─────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────┐   │
│  │ 👤 Marie Jansen                         │   │
│  │    Ik bel je morgen terug               │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ACTIES                                         │
│  📌 Pin huidige chat                            │
│  🔇 Mute huidige chat                           │
│  📦 Archiveer chat                              │
│                                                 │
│  FILTERS                                        │
│  📋 Toon alle chats                             │
│  🔴 Toon ongelezen                              │
│  🔗 Toon gekoppelde                             │
│                                                 │
│  NAVIGATIE                                      │
│  👥 Ga naar Professionals                       │
│  🏢 Ga naar Klanten                             │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

### Edge Cases

1. **Geen chats geladen:** Toon alleen Acties, Filters, Navigatie groepen
2. **Geen chat geselecteerd:** Acties items zijn disabled (grayed out)
3. **Zoekresultaat leeg:** Toon "Geen resultaten gevonden"
4. **Snelle opeenvolgende Cmd+K:** Debounce niet nodig, Dialog handled dit

---

### Test Checklist

- [ ] Cmd+K (Mac) opent palette
- [ ] Ctrl+K (Windows) opent palette
- [ ] Escape sluit palette
- [ ] Klik buiten modal sluit palette
- [ ] Zoeken filtert chats correct
- [ ] Pijltjes navigeren door items
- [ ] Enter selecteert item
- [ ] Chat selectie navigeert en sluit palette
- [ ] Pin/Mute/Archive werkt op huidige chat
- [ ] Filters wisselen correct
- [ ] Navigatie items leiden naar juiste pagina
- [ ] Disabled state voor acties zonder geselecteerde chat

