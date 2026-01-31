

## MOLTBOT-UX-1.4: Lazy Loading Oudere Berichten

### Doel

Implementeer lazy loading voor oudere berichten wanneer de gebruiker omhoog scrollt, zodat grote conversaties (100+ berichten) performant blijven.

---

### Huidige Situatie

**useWhatsAppMessages.ts:**
- Laadt ALLE berichten in één keer (geen limit)
- Gebruikt `useQuery` met ascending order
- Realtime subscription voegt nieuwe berichten toe

**WhatsAppChatDetail.tsx:**
- Virtuoso met `alignToBottom={true}` en `followOutput="smooth"`
- Geen pagination support

---

### Architectuur Beslissing

Voor lazy loading bij omhoog scrollen moet ik kiezen tussen:

| Optie | Voordelen | Nadelen |
|-------|-----------|---------|
| **useInfiniteQuery** | TanStack Query native support, automatische caching | Complexere setup |
| **Manuele state** | Simpeler initieel | Meer custom code |

**Keuze: useInfiniteQuery** - Dit is de standaard aanpak voor pagination met TanStack Query en integreert goed met bestaande realtime subscriptions.

---

### Implementatie

#### Bestand 1: `src/hooks/whatsapp/useWhatsAppMessages.ts`

**Wijzigingen:**

1. **Importeer `useInfiniteQuery`** naast `useQuery`

2. **Definieer PAGE_SIZE constant:**
   ```typescript
   const PAGE_SIZE = 50;
   ```

3. **Vervang `useQuery` door `useInfiniteQuery`:**
   ```typescript
   const {
     data,
     isLoading,
     error,
     fetchNextPage,
     hasNextPage,
     isFetchingNextPage
   } = useInfiniteQuery({
     queryKey: ['whatsapp-messages', chatId],
     queryFn: async ({ pageParam = 0 }) => {
       if (!chatId) return { messages: [], nextCursor: null };

       const { data, error } = await supabase
         .from('whatsapp_messages')
         .select(`...`)
         .eq('chat_id', chatId)
         .order('sent_at', { ascending: false })
         .range(pageParam, pageParam + PAGE_SIZE - 1);

       if (error) throw error;
       
       return {
         messages: (data ?? []).reverse(), // Reverse voor chronologische volgorde
         nextCursor: data?.length === PAGE_SIZE ? pageParam + PAGE_SIZE : null
       };
     },
     getNextPageParam: (lastPage) => lastPage.nextCursor,
     initialPageParam: 0,
     enabled: !!chatId,
   });
   ```

4. **Flatten pages naar messages array:**
   ```typescript
   const messages = useMemo(() => {
     if (!data?.pages) return [];
     // Pages komen in reverse chronological, we moeten ze in de juiste volgorde zetten
     const allMessages: WhatsAppMessage[] = [];
     // Iterate pages in reverse (oudste eerst)
     for (let i = data.pages.length - 1; i >= 0; i--) {
       allMessages.push(...data.pages[i].messages);
     }
     return allMessages;
   }, [data?.pages]);
   ```

5. **Update realtime subscription:**
   - Voeg nieuwe berichten toe aan de EERSTE page (meest recente)

6. **Update return type:**
   ```typescript
   interface UseWhatsAppMessagesReturn {
     messages: WhatsAppMessage[];
     groupedByDate: MessageGroup[];
     isLoading: boolean;
     error: Error | null;
     // Nieuwe properties:
     loadMore: () => void;
     hasMore: boolean;
     isLoadingMore: boolean;
   }
   ```

---

#### Bestand 2: `src/components/whatsapp/WhatsAppChatDetail.tsx`

**Wijzigingen:**

1. **Destructure nieuwe properties:**
   ```typescript
   const { 
     messages, 
     groupedByDate, 
     isLoading,
     loadMore,
     hasMore,
     isLoadingMore 
   } = useWhatsAppMessages(chat.id);
   ```

2. **Voeg Header component toe aan Virtuoso:**
   ```typescript
   components={{
     Header: () => hasMore ? (
       <div className="flex justify-center py-4">
         {isLoadingMore ? (
           <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
         ) : (
           <span className="text-sm text-muted-foreground">
             Scroll omhoog voor meer berichten
           </span>
         )}
       </div>
     ) : null
   }}
   ```

3. **Voeg startReached handler toe:**
   ```typescript
   startReached={() => {
     if (hasMore && !isLoadingMore) {
       loadMore();
     }
   }}
   ```

4. **Voeg firstItemIndex toe voor scroll stabiliteit:**
   ```typescript
   // Virtuoso heeft firstItemIndex nodig om scroll positie te behouden
   // bij prepending items
   firstItemIndex={Math.max(0, 10000 - flattenedItems.length)}
   initialTopMostItemIndex={flattenedItems.length - 1}
   ```

---

### Data Flow Diagram

```text
┌─────────────────────────────────────────────────────────────┐
│                    useInfiniteQuery                          │
├─────────────────────────────────────────────────────────────┤
│  Page 3 (oudst)  │  Page 2  │  Page 1 (nieuwst)             │
│  [msg 100-150]   │ [50-99]  │ [msg 0-49]                    │
└────────┬─────────┴────┬─────┴──────┬────────────────────────┘
         │              │            │
         └──────────────┴────────────┘
                        │
                        ▼ flatten & reverse
         ┌──────────────────────────────────┐
         │  Chronologische berichten array   │
         │  [msg 100, 101, ... 148, 149]    │
         └──────────────────────────────────┘
                        │
                        ▼ groupMessagesByDate
         ┌──────────────────────────────────┐
         │  groupedByDate → flattenedItems   │
         └──────────────────────────────────┘
                        │
                        ▼
         ┌──────────────────────────────────┐
         │          Virtuoso List            │
         │  ┌────────────────────────────┐  │
         │  │ Header (load more spinner) │  │
         │  ├────────────────────────────┤  │
         │  │ DateDivider: "15 januari"  │  │
         │  │ Message bubble             │  │
         │  │ Message bubble             │  │
         │  │ DateDivider: "Gisteren"    │  │
         │  │ Message bubble             │  │
         │  │ DateDivider: "Vandaag"     │  │
         │  │ Message bubble ← newest    │  │
         │  └────────────────────────────┘  │
         └──────────────────────────────────┘
```

---

### Technische Details

| Aspect | Implementatie | Reden |
|--------|---------------|-------|
| `PAGE_SIZE` | 50 | Balans tussen UX en performance |
| Query order | `ascending: false` | Nieuwste eerst laden, dan reverse |
| `firstItemIndex` | 10000 - items.length | Virtuoso scroll stabiliteit bij prepend |
| Realtime insert | Aan page 0 | Nieuwe berichten zijn meest recent |

---

### Edge Cases

1. **Minder dan 50 berichten totaal:**
   - `hasNextPage` = false na eerste load
   - Header component wordt niet getoond

2. **Nieuwe berichten tijdens scroll:**
   - Realtime subscription blijft werken
   - Nieuwe berichten worden onderaan toegevoegd

3. **Chat wisselen:**
   - Query wordt automatisch ge-reset door queryKey change

---

### Test Checklist

Na implementatie verifieer:

- [ ] Initial load toont laatste 50 berichten
- [ ] Omhoog scrollen triggert load more bij top
- [ ] Loading spinner zichtbaar in header tijdens laden
- [ ] Oudere berichten verschijnen bovenaan
- [ ] Scroll positie blijft stabiel na laden (geen sprong)
- [ ] Datum dividers tonen correct
- [ ] hasMore=false wanneer alle berichten geladen
- [ ] Nieuwe realtime berichten verschijnen nog steeds onderaan
- [ ] Empty state werkt bij geen berichten

