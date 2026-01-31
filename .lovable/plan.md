

## BUG FIX: Berichten positionering na virtualisatie

### Probleem Analyse

De `WhatsAppMessageBubble` component bevat al de correcte positioneringslogica:

```tsx
// Regel 42-46 in WhatsAppMessageBubble.tsx
<div className={cn("flex", isOutgoing ? "justify-end" : "justify-start")}>
```

Het probleem is dat de wrapper div in de Virtuoso `itemContent` geen volledige breedte heeft:

```tsx
// Huidige code (broken)
<div className="py-1">
  <WhatsAppMessageBubble message={item.message} />
</div>
```

De flex container in `WhatsAppMessageBubble` werkt alleen correct als de parent element de volledige breedte heeft. Zonder `w-full` of expliciete width neemt de wrapper div alleen de minimale ruimte in.

---

### Oplossing

**Bestand:** `src/components/whatsapp/WhatsAppChatDetail.tsx`

Voeg `w-full` toe aan de wrapper div zodat de flex justify classes correct werken:

```tsx
itemContent={(index, item) => {
  if (item.type === 'divider') {
    return <DateDivider label={item.label} />;
  }
  return (
    <div className="py-1 w-full">  {/* <-- w-full toegevoegd */}
      <WhatsAppMessageBubble message={item.message} />
    </div>
  );
}}
```

---

### Technische Details

| Aspect | Uitleg |
|--------|--------|
| Root cause | Wrapper div had geen expliciete width |
| Fix | `w-full` zorgt dat flex justify-end werkt |
| Alternatief | Zou ook kunnen met `flex` maar `w-full` is simpeler |

---

### Resultaat na fix

- Eigen berichten (`sender_type === 'self'`): RECHTS, groen (#dcf8c6)
- Contact berichten (`sender_type === 'contact'`): LINKS, wit met border

