

## MOLTBOT-UX-1.1: Chatlijst Virtualiseren

### Doel

Vervang de `.map()` rendering in `WhatsAppChatList.tsx` door `react-virtuoso` voor betere performance bij 50+ chats.

---

### Huidige Situatie

De huidige implementatie (regel 85-109) gebruikt een standaard `.map()` loop:

```tsx
chats.map(chat => (
  <WhatsAppChatContextMenu key={chat.id} chat={chat}>
    <div id={`chat-${chat.id}`} role="option" ...>
      <WhatsAppChatItem chat={chat} isSelected={...} onClick={...} />
    </div>
  </WhatsAppChatContextMenu>
))
```

**Probleem:** Bij 50+ chats worden alle DOM-elementen tegelijk gerenderd, wat leidt tot:
- Langzame initiële render
- Hoge geheugengebruik
- Trage scroll performance

---

### Implementatie

**Bestand:** `src/components/whatsapp/WhatsAppChatList.tsx`

#### Wijzigingen

1. **Import toevoegen:**
   - Voeg `Virtuoso` toe van `react-virtuoso`

2. **Vervang de `.map()` loop (regels 85-109):**
   - Behoud loading state en empty state logica
   - Gebruik `Virtuoso` met `data` en `itemContent` props
   - Behoud `WhatsAppChatContextMenu` wrapper
   - Behoud alle ARIA attributen en keyboard handlers

3. **Container styling aanpassen:**
   - Verwijder `overflow-y-auto` van parent container (Virtuoso regelt scrolling)
   - Voeg explicit height styling toe

#### Nieuwe Code Structuur

```tsx
import { Virtuoso } from 'react-virtuoso';

// In de component:
<div 
  className="flex-1 overflow-hidden"  // overflow-hidden i.p.v. overflow-y-auto
  role="listbox"
  aria-label="WhatsApp gesprekken"
  aria-activedescendant={selectedChatId ? `chat-${selectedChatId}` : undefined}
>
  {isLoading ? (
    <ChatListSkeleton />
  ) : chats.length === 0 ? (
    <ChatListEmptyState searchQuery={searchQuery} />
  ) : (
    <Virtuoso
      data={chats}
      style={{ height: '100%' }}
      overscan={10}
      className="scrollbar-thin"
      itemContent={(index, chat) => (
        <WhatsAppChatContextMenu chat={chat}>
          <div
            id={`chat-${chat.id}`}
            role="option"
            aria-selected={selectedChatId === chat.id}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectChat(chat.id);
              }
            }}
          >
            <WhatsAppChatItem
              chat={chat}
              isSelected={selectedChatId === chat.id}
              onClick={() => onSelectChat(chat.id)}
            />
          </div>
        </WhatsAppChatContextMenu>
      )}
    />
  )}
</div>
```

---

### Bestaande Patronen in Project

Het project gebruikt `react-virtuoso` al op twee plaatsen:

| Component | Gebruik | Referentie |
|-----------|---------|------------|
| `TaskListVirtualized.tsx` | `TableVirtuoso` voor tabelweergave | Overscan: 5, fixed row height |
| `ApplicationMatchesTab.tsx` | `Virtuoso` voor kaartweergave | Overscan: 10, dynamic height |

Ik volg het patroon van `ApplicationMatchesTab.tsx` omdat dit het meest lijkt op onze chatlijst (verticale lijst met variabele items).

---

### Technische Details

| Aspect | Waarde |
|--------|--------|
| Overscan | 10 items (buffer voor smooth scrolling) |
| Height | 100% (flex container) |
| Key prop | Niet nodig - Virtuoso handelt dit intern af |
| Scroll restoration | Automatisch door Virtuoso |

---

### Behouden Functionaliteit

De volgende functionaliteit blijft volledig intact:

- Context menu (rechtermuisklik)
- Keyboard navigatie (Enter/Space om te selecteren)
- Selected state highlighting
- ARIA attributen voor accessibility
- Loading skeleton
- Empty state bij geen resultaten

---

### Test Checklist

Na implementatie verifieer:

- [ ] Chats laden correct
- [ ] Klikken opent detail view
- [ ] Selected state werkt (blauwe border)
- [ ] Zoeken werkt (lijst filtert correct)
- [ ] Filter tabs werken (All/Unread/Linked)
- [ ] Tag filter werkt
- [ ] Realtime updates werken (nieuwe berichten verschijnen)
- [ ] Context menu werkt (rechtsklik)
- [ ] Keyboard navigatie werkt (Enter/Space)
- [ ] Scroll performance is smooth bij 50+ chats

