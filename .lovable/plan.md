

## STAP 2.2: Keyboard Shortcuts

### Doel

Voeg extra keyboard shortcuts toe aan de WhatsApp pagina voor snelle acties zoals zoeken, pinnen, muten en archiveren.

---

### Huidige Situatie

**WhatsApp.tsx:**
- Heeft al keyboard handling (regels 97-151)
- `Cmd+K` opent command palette
- Pijltjes navigeren door chats
- `Escape` sluit profile/navigeert terug
- `i` toont/verbergt profile panel
- `selectedChat` is al beschikbaar via useMemo (regel 66-69)
- Mist: `useUpdateChatStatus` hook import

**WhatsAppChatList.tsx:**
- Search input op regel 48-54
- Mist: `data-search-input` attribuut

---

### Nieuwe Shortcuts Overzicht

| Shortcut | Actie | Voorwaarde |
|----------|-------|------------|
| `Cmd+F` / `Ctrl+F` | Focus zoekveld | Altijd |
| `Cmd+P` / `Ctrl+P` | Pin/unpin chat | Chat geselecteerd |
| `Cmd+M` / `Ctrl+M` | Mute/unmute chat | Chat geselecteerd |
| `Cmd+Shift+A` / `Ctrl+Shift+A` | Archiveer chat | Chat geselecteerd |

---

### Bestand 1: WhatsApp.tsx

**Wijzigingen:**

1. **Importeer useUpdateChatStatus hook:**
   ```typescript
   import { useUpdateChatStatus } from "@/hooks/whatsapp/useUpdateChatStatus";
   ```

2. **Initialiseer hook in component:**
   ```typescript
   const updateStatus = useUpdateChatStatus();
   ```

3. **Voeg shortcuts toe aan handleKeyDown (binnen switch statement):**

   ```typescript
   // Na case 'k' en voor de input check, voeg toe:
   case 'f':
     if (e.metaKey || e.ctrlKey) {
       e.preventDefault();
       const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement;
       searchInput?.focus();
     }
     break;
   
   case 'p':
     if ((e.metaKey || e.ctrlKey) && selectedChatId && selectedChat) {
       e.preventDefault();
       updateStatus.mutate({
         chatId: selectedChatId,
         field: 'is_pinned',
         value: !selectedChat.is_pinned,
       });
     }
     break;
   
   case 'm':
     if ((e.metaKey || e.ctrlKey) && selectedChatId && selectedChat) {
       e.preventDefault();
       updateStatus.mutate({
         chatId: selectedChatId,
         field: 'is_muted',
         value: !selectedChat.is_muted,
       });
     }
     break;
   
   case 'a':
     if ((e.metaKey || e.ctrlKey) && e.shiftKey && selectedChatId) {
       e.preventDefault();
       updateStatus.mutate({
         chatId: selectedChatId,
         field: 'is_archived',
         value: true,
       });
     }
     break;
   ```

4. **Update useEffect dependencies:**
   ```typescript
   // Voeg updateStatus toe aan dependency array
   }, [filteredChats, selectedChatId, selectedChat, handleSelectChat, handleBack, showProfile, toggleProfile, updateStatus]);
   ```

---

### Bestand 2: WhatsAppChatList.tsx

**Wijziging:**

Voeg `data-search-input` attribuut toe aan de Input component (regel 48-54):

```tsx
<Input
  placeholder="Zoek in gesprekken..."
  value={searchQuery}
  onChange={(e) => onSearchChange(e.target.value)}
  className="pl-10"
  aria-label="Zoek in gesprekken"
  data-search-input  // <-- Toevoegen
/>
```

---

### Toast Feedback

De `useUpdateChatStatus` hook heeft al toast feedback ingebouwd:

```typescript
// In useUpdateChatStatus.ts (regel 26-30)
const messages: Record<typeof field, string> = {
  is_pinned: value ? 'Chat gepind' : 'Chat losgemaakt',
  is_muted: value ? 'Chat gedempt' : 'Demping opgeheven',
  is_archived: 'Chat gearchiveerd',
};
toast.success(messages[field]);
```

Er zijn geen extra toast implementaties nodig.

---

### Keyboard Flow Diagram

```text
┌─────────────────────────────────────────────────────────────┐
│                    handleKeyDown                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────┐                                         │
│  │ Cmd+K          │ → Open Command Palette                  │
│  │ Cmd+F          │ → Focus Search Input                    │
│  └────────────────┘                                         │
│         ↓ (works even in inputs)                            │
│                                                              │
│  ┌────────────────┐                                         │
│  │ Input focused? │ → STOP (don't hijack typing)            │
│  └────────────────┘                                         │
│         ↓ (not in input)                                    │
│                                                              │
│  ┌────────────────┐                                         │
│  │ Cmd+P          │ → Toggle Pin (if chat selected)         │
│  │ Cmd+M          │ → Toggle Mute (if chat selected)        │
│  │ Cmd+Shift+A    │ → Archive (if chat selected)            │
│  │ Arrow keys     │ → Navigate chats                        │
│  │ Escape         │ → Close profile / Go back               │
│  │ i              │ → Toggle profile panel                  │
│  └────────────────┘                                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### Technische Details

| Aspect | Implementatie |
|--------|---------------|
| Cmd+F positie | Voor input check (werkt altijd) |
| Cmd+P/M/A positie | Na input check (niet in inputs) |
| Browser default | `e.preventDefault()` voorkomt Print dialog (Cmd+P) |
| Toast feedback | Via bestaande useUpdateChatStatus hook |
| Archiveer | Alleen true (geen toggle, eenrichtingsactie) |

---

### Edge Cases

1. **Cmd+P in input veld:** Wordt nu toegestaan omdat het voor de input check staat - maar we willen dit NIET doen. Cmd+P moet na de input check staan zodat je nog gewoon kunt typen.

2. **Cmd+F altijd:** Dit moet WEL voor de input check staan zodat je altijd kunt focussen op zoeken.

3. **Chat niet geladen:** selectedChat kan null zijn bij page refresh - shortcuts negeren dan.

---

### Correcte Volgorde in handleKeyDown

```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  // STAP 1: Shortcuts die ALTIJD werken (ook in inputs)
  if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    setCommandPaletteOpen(true);
    return;
  }
  
  if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement;
    searchInput?.focus();
    return;
  }

  // STAP 2: Stop als we in een input zitten
  if (document.activeElement?.tagName === 'INPUT' || 
      document.activeElement?.tagName === 'TEXTAREA') return;

  // STAP 3: Shortcuts die NIET in inputs werken
  switch (e.key) {
    case 'p':
      if ((e.metaKey || e.ctrlKey) && selectedChatId && selectedChat) { ... }
      break;
    case 'm':
      if ((e.metaKey || e.ctrlKey) && selectedChatId && selectedChat) { ... }
      break;
    case 'a':
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && selectedChatId) { ... }
      break;
    // ... bestaande cases
  }
};
```

---

### Test Checklist

- [ ] Cmd+F focust zoekveld (ook als andere input focus heeft)
- [ ] Cmd+P toggled pin status met toast "Chat gepind" / "Chat losgemaakt"
- [ ] Cmd+M toggled mute status met toast "Chat gedempt" / "Demping opgeheven"
- [ ] Cmd+Shift+A archiveert chat met toast "Chat gearchiveerd"
- [ ] Cmd+P werkt NIET als zoekveld focus heeft (voorkomt typen problemen)
- [ ] Shortcuts Cmd+P/M/A doen niets als geen chat geselecteerd
- [ ] Cmd+P overschrijft browser print dialog

