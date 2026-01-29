

# WhatsApp Chat Context Menu - Implementatie Plan

## Overzicht

Voeg een context menu toe aan chat items in de lijst met rechtermuisklik/lange druk ondersteuning. Het menu bevat opties voor hernoemen, pinnen, muten, archiveren en verwijderen.

## Huidige Situatie

| Component | Status |
|-----------|--------|
| `whatsapp_chats.is_pinned` kolom | Bestaat (BOOLEAN DEFAULT false) |
| `whatsapp_chats.is_muted` kolom | Bestaat (BOOLEAN DEFAULT false) |
| `whatsapp_chats.is_archived` kolom | Bestaat (BOOLEAN DEFAULT false) |
| WhatsAppChatItem context menu | Niet geimplementeerd |
| Sorteer gepinde chats bovenaan | Niet geimplementeerd |
| TypeScript WhatsAppChat interface | Mist is_pinned, is_muted, is_archived |

## Implementatie Stappen

### 1. Update WhatsAppChat Type

**Bestand:** `src/types/whatsapp.ts`

Voeg de nieuwe velden toe aan de interface:

```typescript
export interface WhatsAppChat {
  // ... bestaande velden
  is_pinned: boolean;
  is_muted: boolean;
  is_archived: boolean;
  // Relations
  contact?: WhatsAppContact | null;
  linked_professional?: { id: string; full_name: string } | null;
}
```

### 2. useUpdateChatStatus Hook

**Bestand:** `src/hooks/whatsapp/useUpdateChatStatus.ts`

```typescript
interface UpdateChatStatusParams {
  chatId: string;
  field: 'is_pinned' | 'is_muted' | 'is_archived';
  value: boolean;
}

export function useUpdateChatStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ chatId, field, value }: UpdateChatStatusParams) => {
      const { error } = await supabase
        .from('whatsapp_chats')
        .update({ [field]: value })
        .eq('id', chatId);

      if (error) throw error;
    },
    onSuccess: (_, { field, value }) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
      
      const messages = {
        is_pinned: value ? 'Chat gepind' : 'Chat losgemaakt',
        is_muted: value ? 'Chat gedempt' : 'Demping opgeheven',
        is_archived: 'Chat gearchiveerd',
      };
      toast.success(messages[field]);
    },
    onError: (error) => {
      console.error('Failed to update chat status:', error);
      toast.error('Kon chat status niet bijwerken');
    },
  });
}
```

### 3. useDeleteChat Hook

**Bestand:** `src/hooks/whatsapp/useDeleteChat.ts`

```typescript
export function useDeleteChat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (chatId: string) => {
      // Delete messages first (cascade niet automatisch)
      await supabase
        .from('whatsapp_messages')
        .delete()
        .eq('chat_id', chatId);
        
      // Delete chat
      const { error } = await supabase
        .from('whatsapp_chats')
        .delete()
        .eq('id', chatId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
      toast.success('Chat verwijderd');
    },
    onError: (error) => {
      console.error('Failed to delete chat:', error);
      toast.error('Kon chat niet verwijderen');
    },
  });
}
```

### 4. WhatsAppChatContextMenu Component

**Bestand:** `src/components/whatsapp/WhatsAppChatContextMenu.tsx`

**Structuur:**
```text
┌─────────────────────────────────────────┐
│  ✏️ Contact hernoemen                   │
│  ─────────────────────────────────────  │
│  📌 Chat pinnen / Losmaken              │
│  🔇 Chat muten / Unmuten                │
│  📁 Archiveren                          │
│  ─────────────────────────────────────  │
│  🗑️ Chat verwijderen                    │
└─────────────────────────────────────────┘
```

**Props:**
```typescript
interface WhatsAppChatContextMenuProps {
  chat: WhatsAppChat;
  children: React.ReactNode;
  onRename: () => void;
}
```

**Component:**
```tsx
export function WhatsAppChatContextMenu({ chat, children, onRename }: WhatsAppChatContextMenuProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const updateStatus = useUpdateChatStatus();
  const deleteChat = useDeleteChat();
  
  const handlePin = () => {
    updateStatus.mutate({
      chatId: chat.id,
      field: 'is_pinned',
      value: !chat.is_pinned,
    });
  };
  
  const handleMute = () => {
    updateStatus.mutate({
      chatId: chat.id,
      field: 'is_muted',
      value: !chat.is_muted,
    });
  };
  
  const handleArchive = () => {
    updateStatus.mutate({
      chatId: chat.id,
      field: 'is_archived',
      value: true,
    });
  };
  
  const handleDelete = () => {
    deleteChat.mutate(chat.id);
    setDeleteDialogOpen(false);
  };
  
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={onRename}>
            <Pencil className="h-4 w-4 mr-2" />
            Contact hernoemen
          </ContextMenuItem>
          
          <ContextMenuSeparator />
          
          <ContextMenuItem onClick={handlePin}>
            <Pin className="h-4 w-4 mr-2" />
            {chat.is_pinned ? 'Losmaken' : 'Chat pinnen'}
          </ContextMenuItem>
          
          <ContextMenuItem onClick={handleMute}>
            {chat.is_muted ? (
              <>
                <Volume2 className="h-4 w-4 mr-2" />
                Unmuten
              </>
            ) : (
              <>
                <BellOff className="h-4 w-4 mr-2" />
                Chat muten
              </>
            )}
          </ContextMenuItem>
          
          <ContextMenuItem onClick={handleArchive}>
            <Archive className="h-4 w-4 mr-2" />
            Archiveren
          </ContextMenuItem>
          
          <ContextMenuSeparator />
          
          <ContextMenuItem 
            onClick={() => setDeleteDialogOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Chat verwijderen
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      
      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chat verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je deze chat wilt verwijderen? 
              Alle berichten worden permanent verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

### 5. WhatsAppRenameDialog Component

**Bestand:** `src/components/whatsapp/WhatsAppRenameDialog.tsx`

```tsx
interface WhatsAppRenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: {
    id: string;
    display_name: string | null;
    push_name: string | null;
    phone_number: string;
  } | null;
}

export function WhatsAppRenameDialog({ open, onOpenChange, contact }: WhatsAppRenameDialogProps) {
  const [name, setName] = useState('');
  const updateName = useUpdateContactName();
  
  useEffect(() => {
    if (open && contact) {
      setName(contact.display_name || contact.push_name || contact.phone_number);
    }
  }, [open, contact]);
  
  const handleSave = () => {
    if (contact && name.trim()) {
      updateName.mutate({ contactId: contact.id, displayName: name.trim() });
      onOpenChange(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact hernoemen</DialogTitle>
          <DialogDescription>
            Geef dit contact een aangepaste naam.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Naam"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 6. Update WhatsAppChatItem

Voeg visuele indicatoren toe voor gepinde en gemute chats:

```tsx
export function WhatsAppChatItem({ chat, isSelected, onClick }: WhatsAppChatItemProps) {
  const displayName = chat.contact?.display_name || formatPhone(chat.contact?.phone_number || 'Onbekend');
  const hasUnread = chat.unread_count > 0;
  const isLinked = !!chat.linked_professional_id;
  const isPinned = chat.is_pinned;
  const isMuted = chat.is_muted;

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-3 cursor-pointer transition-colors border-b border-border/50",
        "hover:bg-accent/50",
        isSelected && "bg-accent border-l-2 border-l-primary",
        isMuted && "opacity-60" // Muted styling
      )}
    >
      {/* Avatar */}
      <WhatsAppContactAvatar ... />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Top row: Name + Timestamp */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Pin indicator */}
            {isPinned && (
              <Pin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            )}
            <span className={cn(
              "font-medium text-sm truncate",
              hasUnread && "text-foreground",
              !hasUnread && "text-foreground/80"
            )}>
              {displayName}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Mute indicator */}
            {isMuted && (
              <BellOff className="h-3 w-3 text-muted-foreground" />
            )}
            <span className={cn(
              "text-xs",
              hasUnread ? "text-[#25D366] font-medium" : "text-muted-foreground"
            )}>
              {formatTimestamp(chat.last_message_at)}
            </span>
          </div>
        </div>

        {/* ... rest of component */}
      </div>
    </div>
  );
}
```

### 7. Update WhatsAppChatList

Integreer context menu en rename dialog:

```tsx
export function WhatsAppChatList({ ... }: WhatsAppChatListProps) {
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [selectedContactForRename, setSelectedContactForRename] = useState<...>(null);
  
  const handleRename = (chat: WhatsAppChat) => {
    if (chat.contact) {
      setSelectedContactForRename({
        id: chat.contact.id,
        display_name: chat.contact.display_name,
        push_name: chat.contact.push_name,
        phone_number: chat.contact.phone_number,
      });
      setRenameDialogOpen(true);
    }
  };
  
  return (
    <div className="flex flex-col h-full">
      {/* ... header */}

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto" ...>
        {chats.map(chat => (
          <WhatsAppChatContextMenu
            key={chat.id}
            chat={chat}
            onRename={() => handleRename(chat)}
          >
            <div ...>
              <WhatsAppChatItem ... />
            </div>
          </WhatsAppChatContextMenu>
        ))}
      </div>
      
      {/* Rename dialog */}
      <WhatsAppRenameDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        contact={selectedContactForRename}
      />
    </div>
  );
}
```

### 8. Update useWhatsAppChats Hook

Sorteer gepinde chats bovenaan en filter gearchiveerde chats:

```typescript
const filteredChats = useMemo(() => {
  let result = [...chats];

  // Filter gearchiveerde chats (tenzij specifiek gefilterd)
  if (filter !== 'archived') {
    result = result.filter(chat => !chat.is_archived);
  }

  // Apply filter
  if (filter === 'unread') {
    result = result.filter(chat => chat.unread_count > 0);
  } else if (filter === 'linked') {
    result = result.filter(chat => chat.linked_professional_id !== null);
  } else if (filter === 'archived') {
    result = result.filter(chat => chat.is_archived);
  }

  // Apply tag filter
  if (tagFilter) {
    result = result.filter(chat => 
      chat.contact?.tags?.includes(tagFilter)
    );
  }

  // Apply search
  if (searchQuery.trim()) {
    // ... existing search logic
  }

  // Sorteer: gepinde chats eerst
  result.sort((a, b) => {
    // Pinned first
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    // Then by last_message_at (already sorted from DB but ensure consistency)
    return 0;
  });

  return result;
}, [chats, filter, tagFilter, searchQuery]);
```

## Bestanden Overzicht

| Actie | Bestand | Beschrijving |
|-------|---------|--------------|
| EDIT | `src/types/whatsapp.ts` | Voeg is_pinned, is_muted, is_archived toe |
| CREATE | `src/hooks/whatsapp/useUpdateChatStatus.ts` | Mutation voor pin/mute/archive |
| CREATE | `src/hooks/whatsapp/useDeleteChat.ts` | Mutation voor chat verwijderen |
| CREATE | `src/components/whatsapp/WhatsAppChatContextMenu.tsx` | Context menu component |
| CREATE | `src/components/whatsapp/WhatsAppRenameDialog.tsx` | Hernoem dialog |
| EDIT | `src/components/whatsapp/WhatsAppChatItem.tsx` | Pin/mute indicators |
| EDIT | `src/components/whatsapp/WhatsAppChatList.tsx` | Integreer context menu |
| EDIT | `src/hooks/whatsapp/useWhatsAppChats.ts` | Filter archived, sorteer pinned |

## Visueel Overzicht

```text
Chat Item met indicators:
┌─────────────────────────────────────────────────────────┐
│ 👤 📌 Jan de Vries                         🔇 14:30    │
│    Bedankt voor het bericht!                      (3)   │
│    🟢🟡                                                 │
└─────────────────────────────────────────────────────────┘

Context Menu (rechtermuisklik):
┌─────────────────────────────────────┐
│  ✏️ Contact hernoemen               │
│  ─────────────────────────────────  │
│  📌 Losmaken                        │  ← Toggle
│  🔊 Unmuten                         │  ← Toggle
│  📁 Archiveren                      │
│  ─────────────────────────────────  │
│  🗑️ Chat verwijderen                │  ← Destructive
└─────────────────────────────────────┘
```

## Test Na Implementatie

1. Rechtermuisklik op een chat item → context menu verschijnt
2. Klik "Contact hernoemen" → rename dialog opent
3. Voer nieuwe naam in en opslaan → naam wordt bijgewerkt
4. Klik "Chat pinnen" → chat krijgt pin icoon, verplaatst naar boven
5. Klik nogmaals (nu "Losmaken") → pin verdwijnt
6. Klik "Chat muten" → chat krijgt mute icoon + opacity
7. Klik "Archiveren" → chat verdwijnt uit lijst
8. Klik "Chat verwijderen" → confirm dialog verschijnt
9. Bevestig → chat wordt permanent verwijderd
10. Ververs pagina → statussen zijn persistent

