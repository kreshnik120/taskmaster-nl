

## MOLTBOT-UX-1.3: Berichtenlijst Virtualiseren

### Doel

Virtualiseer de berichtenlijst in `WhatsAppChatDetail.tsx` voor betere performance bij 100+ berichten per conversatie.

---

### Huidige Situatie

De huidige implementatie (regel 194-218) gebruikt geneste `.map()` loops met datum-groepen:

```tsx
<div className="flex-1 overflow-y-auto p-4">
  {groupedByDate.map((group) => (
    <div key={group.label}>
      <DateDivider label={group.label} />
      <div className="space-y-2">
        {group.messages.map((message) => (
          <WhatsAppMessageBubble key={message.id} message={message} />
        ))}
      </div>
    </div>
  ))}
  <div ref={messagesEndRef} />
</div>
```

**Probleem:** Bij 100+ berichten worden alle DOM-elementen tegelijk gerenderd, wat leidt tot:
- Langzame initiële render
- Hoge geheugengebruik
- Scroll-lag bij lange conversaties

---

### Uitdaging: Datum Dividers

Virtuoso werkt met een platte array, maar de huidige structuur is genest (groepen met berichten). Ik moet een nieuwe data structuur maken die zowel datum-dividers als berichten bevat in één platte lijst.

**Oplossing:** Een "flattened" array maken met twee typen items:

```typescript
type VirtualItem = 
  | { type: 'divider'; label: string }
  | { type: 'message'; message: WhatsAppMessage };
```

---

### Implementatie

**Bestand:** `src/components/whatsapp/WhatsAppChatDetail.tsx`

#### Wijzigingen

1. **Imports toevoegen:**
   - `Virtuoso` en `VirtuosoHandle` van `react-virtuoso`

2. **Flatten functie toevoegen:**
   - Converteer `groupedByDate` naar een platte array met dividers en berichten

3. **Virtuoso implementeren:**
   - Gebruik `alignToBottom={true}` voor chat-style layout
   - Gebruik `followOutput="smooth"` voor auto-scroll bij nieuwe berichten
   - Gebruik `initialTopMostItemIndex` om onderaan te starten

4. **Container styling aanpassen:**
   - `overflow-y-auto` → `overflow-hidden`
   - Padding verplaatsen naar Virtuoso items

5. **Oude refs verwijderen:**
   - `messagesEndRef` is niet meer nodig (Virtuoso regelt scroll)

#### Nieuwe Data Structuur

```typescript
type VirtualItem = 
  | { type: 'divider'; label: string; key: string }
  | { type: 'message'; message: WhatsAppMessage; key: string };

// Flatten functie
const flattenedItems = useMemo(() => {
  const items: VirtualItem[] = [];
  groupedByDate.forEach(group => {
    items.push({ type: 'divider', label: group.label, key: `divider-${group.label}` });
    group.messages.forEach(msg => {
      items.push({ type: 'message', message: msg, key: msg.id });
    });
  });
  return items;
}, [groupedByDate]);
```

#### Virtuoso Component

```tsx
<Virtuoso
  ref={virtuosoRef}
  data={flattenedItems}
  initialTopMostItemIndex={flattenedItems.length - 1}
  followOutput="smooth"
  alignToBottom={true}
  style={{ height: '100%' }}
  className="px-4"
  itemContent={(index, item) => {
    if (item.type === 'divider') {
      return <DateDivider label={item.label} />;
    }
    return (
      <div className="py-1">
        <WhatsAppMessageBubble message={item.message} />
      </div>
    );
  }}
/>
```

---

### Technische Details

| Aspect | Waarde | Reden |
|--------|--------|-------|
| `alignToBottom` | `true` | Chat-style layout (nieuwste onderaan) |
| `followOutput` | `"smooth"` | Smooth scroll bij nieuwe berichten |
| `initialTopMostItemIndex` | `items.length - 1` | Start onderaan bij openen |
| Padding | Op items i.p.v. container | Virtuoso beheert eigen scrolling |

---

### Behouden Functionaliteit

- DateDividers tussen berichten
- Screen reader announcements
- Loading skeleton
- Empty state
- Alle WhatsAppMessageBubble props

### Te Verwijderen

- `messagesEndRef` en bijbehorende scroll effect
- Handmatige scroll-to-bottom logica

---

### Test Checklist

Na implementatie verifieer:

- [ ] Berichten laden correct
- [ ] Datum dividers tonen correct ("Vandaag", "Gisteren", etc.)
- [ ] Scroll start onderaan (nieuwste berichten zichtbaar)
- [ ] Nieuwe berichten verschijnen onderaan met smooth scroll
- [ ] Omhoog scrollen werkt smooth
- [ ] Message bubbles tonen correct (eigen vs contact)
- [ ] Media (afbeeldingen, documenten) tonen correct
- [ ] Screen reader announcements werken nog
- [ ] Empty state werkt bij geen berichten

