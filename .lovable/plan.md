

## KRITIEKE FIX: "old is not iterable" Fout bij Versturen Berichten

### Probleem Geïdentificeerd

De fout treedt op omdat er een **type mismatch** is tussen twee hooks:

| Hook | Data Structuur | Probleem |
|------|----------------|----------|
| `useWhatsAppMessages` | `{ pages: PageResult[], pageParams: number[] }` | InfiniteQuery structuur |
| `useWhatsAppSendMessage` | Verwacht `WhatsAppMessage[]` | Probeert te itereren over pages object |

### Fout Locatie

```typescript
// useWhatsAppSendMessage.ts regel 73-75
queryClient.setQueryData<WhatsAppMessage[]>(['whatsapp-messages', chatId], (old) => {
  return old ? [...old, optimisticMessage] : [optimisticMessage];
  //           ^^^^^^ FOUT: old is { pages: [...], pageParams: [...] }, niet een array!
});
```

### Oplossing

Update `useWhatsAppSendMessage.ts` om correct te werken met de InfiniteQuery data structuur:

```typescript
interface InfiniteData {
  pages: { messages: WhatsAppMessage[]; nextCursor: number | null }[];
  pageParams: number[];
}

// onMutate - Voeg optimistic message toe aan eerste pagina
queryClient.setQueryData<InfiniteData>(['whatsapp-messages', chatId], (old) => {
  if (!old?.pages?.length) return old;
  
  const updatedPages = [...old.pages];
  updatedPages[0] = {
    ...updatedPages[0],
    messages: [...updatedPages[0].messages, optimisticMessage]
  };
  
  return { ...old, pages: updatedPages };
});

// onSuccess - Update status in eerste pagina
queryClient.setQueryData<InfiniteData>(['whatsapp-messages', chatId], (old) => {
  if (!old?.pages?.length) return old;
  
  const updatedPages = old.pages.map(page => ({
    ...page,
    messages: page.messages.map(msg => 
      msg.id === context?.optimisticMessage.id
        ? { ...msg, status: 'sent' as const }
        : msg
    )
  }));
  
  return { ...old, pages: updatedPages };
});

// onError - Rollback met correcte structuur
if (context?.previousData) {
  queryClient.setQueryData(['whatsapp-messages', chatId], context.previousData);
}
```

---

### Bestanden te Wijzigen

| Bestand | Wijziging |
|---------|-----------|
| `src/hooks/whatsapp/useWhatsAppSendMessage.ts` | Fix data structuur handling voor InfiniteQuery |

---

### Wijzigingen Detail

1. **Type definitie toevoegen** voor InfiniteQuery data structuur
2. **onMutate aanpassen** - Navigeer naar `old.pages[0].messages` in plaats van `old`
3. **onSuccess aanpassen** - Map over pages en messages correct
4. **onError aanpassen** - Rollback met correcte InfiniteData structuur
5. **Null checks toevoegen** - `old?.pages?.length` om edge cases af te handelen

---

### Impact

- ✅ Berichten kunnen weer verstuurd worden
- ✅ Optimistic UI werkt correct met infinite scrolling
- ✅ Geen breaking changes voor bestaande functionaliteit
- ✅ Consistente data structuur met `useWhatsAppMessages`

