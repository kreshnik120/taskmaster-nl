

# WhatsApp Contact Tags - Implementatie Plan

## Overzicht

Implementeer een tags/labels systeem voor WhatsApp contacten met gekleurde badges, add/remove functionaliteit en filtering in de chat list.

## Huidige Situatie

| Component | Status |
|-----------|--------|
| `whatsapp_contacts.tags` kolom | Bestaat (TEXT[] DEFAULT '{}') |
| WhatsAppContactProfile Labels sectie | Placeholder tekst |
| ChatList filter | Alleen: all, unread, linked |

## Implementatie Stappen

### 1. Tag Configuratie (Constants)

**Bestand:** `src/lib/whatsapp-tags.ts`

```typescript
export interface TagConfig {
  id: string;
  label: string;
  color: {
    bg: string;
    text: string;
    border: string;
  };
}

export const WHATSAPP_TAGS: TagConfig[] = [
  { id: 'client', label: 'Cliënt', color: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' } },
  { id: 'family', label: 'Familie', color: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' } },
  { id: 'colleague', label: 'Collega', color: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' } },
  { id: 'urgent', label: 'Urgent', color: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' } },
  { id: 'vip', label: 'VIP', color: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' } },
  { id: 'new', label: 'Nieuw', color: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' } },
];

export function getTagConfig(tagId: string): TagConfig | undefined {
  return WHATSAPP_TAGS.find(t => t.id === tagId);
}
```

### 2. WhatsAppContactTags Component

**Bestand:** `src/components/whatsapp/WhatsAppContactTags.tsx`

**Props:**
```typescript
interface WhatsAppContactTagsProps {
  contactId: string;
  tags: string[];
  editable?: boolean;
}
```

**Structuur:**
```text
┌─────────────────────────────────────────────────────────┐
│  [Cliënt ✕] [VIP ✕]  [+ Label]                         │
└─────────────────────────────────────────────────────────┘

Popover (bij klik "+ Label"):
┌─────────────────────────────────────────────────────────┐
│  Voeg label toe                                         │
│  ───────────────                                        │
│  ○ Cliënt      (groen)                                  │
│  ○ Familie     (blauw)                                  │
│  ○ Collega     (paars)                                  │
│  ○ Urgent      (rood)                                   │
│  ○ VIP         (goud)                                   │
│  ○ Nieuw       (grijs)                                  │
└─────────────────────────────────────────────────────────┘
```

**Component Implementatie:**
```tsx
export function WhatsAppContactTags({ contactId, tags, editable = false }: WhatsAppContactTagsProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<string | null>(null);
  
  const updateTags = useUpdateContactTags();
  
  const availableTags = WHATSAPP_TAGS.filter(t => !tags.includes(t.id));
  
  const handleAddTag = (tagId: string) => {
    updateTags.mutate({ 
      contactId, 
      tags: [...tags, tagId] 
    });
    setPopoverOpen(false);
  };
  
  const handleRemoveTag = (tagId: string) => {
    setTagToDelete(tagId);
    setDeleteDialogOpen(true);
  };
  
  const confirmRemoveTag = () => {
    if (tagToDelete) {
      updateTags.mutate({ 
        contactId, 
        tags: tags.filter(t => t !== tagToDelete) 
      });
    }
    setDeleteDialogOpen(false);
    setTagToDelete(null);
  };
  
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {tags.map(tagId => {
        const config = getTagConfig(tagId);
        if (!config) return null;
        return (
          <Badge
            key={tagId}
            className={cn(config.color.bg, config.color.text, config.color.border, "border")}
          >
            {config.label}
            {editable && (
              <button onClick={() => handleRemoveTag(tagId)} className="ml-1">
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        );
      })}
      
      {editable && availableTags.length > 0 && (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 text-xs">
              <Plus className="h-3 w-3 mr-1" />
              Label
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Voeg label toe
            </p>
            <div className="space-y-1">
              {availableTags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => handleAddTag(tag.id)}
                  className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-muted text-sm"
                >
                  <div className={cn("w-3 h-3 rounded-full", tag.color.bg)} />
                  {tag.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
      
      {/* Confirm delete dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Label verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je dit label wilt verwijderen van dit contact?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveTag}>
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

### 3. useUpdateContactTags Hook

**Bestand:** `src/hooks/whatsapp/useUpdateContactTags.ts`

```typescript
interface UpdateContactTagsParams {
  contactId: string;
  tags: string[];
}

export function useUpdateContactTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, tags }: UpdateContactTagsParams) => {
      const { error } = await supabase
        .from('whatsapp_contacts')
        .update({ tags })
        .eq('id', contactId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-contact'] });
      toast.success('Labels bijgewerkt');
    },
    onError: (error) => {
      console.error('Failed to update tags:', error);
      toast.error('Kon labels niet bijwerken');
    },
  });
}
```

### 4. Update WhatsAppContactProfile

Vervang de placeholder Labels sectie (regels 133-141):

```tsx
{/* Labels section */}
<div className="px-4 py-4 space-y-2">
  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
    <Tag className="h-3.5 w-3.5" />
    Labels
  </h4>
  <WhatsAppContactTags
    contactId={displayContact?.id || ''}
    tags={displayContact?.tags || []}
    editable={!!displayContact?.id}
  />
</div>
```

### 5. Tag Filter in ChatList

#### 5a. Uitbreiden WhatsAppFilter type

**src/types/whatsapp.ts:**
```typescript
export type WhatsAppFilter = 'all' | 'unread' | 'linked' | `tag:${string}`;
```

#### 5b. Nieuwe WhatsAppTagFilter Component

**Bestand:** `src/components/whatsapp/WhatsAppTagFilter.tsx`

```tsx
interface WhatsAppTagFilterProps {
  selectedTag: string | null;
  onSelectTag: (tagId: string | null) => void;
  availableTags: string[]; // Tags that exist on contacts
}

export function WhatsAppTagFilter({ selectedTag, onSelectTag, availableTags }: WhatsAppTagFilterProps) {
  if (availableTags.length === 0) return null;
  
  return (
    <Select 
      value={selectedTag || 'all'} 
      onValueChange={(v) => onSelectTag(v === 'all' ? null : v)}
    >
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="Filter op label" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Alle labels</SelectItem>
        {availableTags.map(tagId => {
          const config = getTagConfig(tagId);
          if (!config) return null;
          return (
            <SelectItem key={tagId} value={tagId}>
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", config.color.bg)} />
                {config.label}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
```

#### 5c. Update useWhatsAppChats Hook

Voeg tag filtering toe:

```typescript
// Nieuwe state
const [tagFilter, setTagFilter] = useState<string | null>(null);

// In filteredChats useMemo
if (tagFilter) {
  result = result.filter(chat => 
    chat.contact?.tags?.includes(tagFilter)
  );
}

// Stats uitbreiden
const availableTags = useMemo(() => {
  const tagSet = new Set<string>();
  chats.forEach(chat => {
    chat.contact?.tags?.forEach(tag => tagSet.add(tag));
  });
  return Array.from(tagSet);
}, [chats]);

// Return uitbreiden
return {
  ...existing,
  tagFilter,
  setTagFilter,
  availableTags,
};
```

#### 5d. Update WhatsAppChatList

Voeg tag filter dropdown toe onder de tabs:

```tsx
{/* Tag filter - alleen tonen als er tags zijn */}
{availableTags.length > 0 && (
  <WhatsAppTagFilter
    selectedTag={tagFilter}
    onSelectTag={onTagFilterChange}
    availableTags={availableTags}
  />
)}
```

### 6. Show Tags in WhatsAppChatItem

Voeg kleine tag indicators toe aan chat items:

```tsx
{/* Na de preview text */}
{chat.contact?.tags && chat.contact.tags.length > 0 && (
  <div className="flex gap-1 mt-1">
    {chat.contact.tags.slice(0, 2).map(tagId => {
      const config = getTagConfig(tagId);
      if (!config) return null;
      return (
        <div 
          key={tagId}
          className={cn("w-2 h-2 rounded-full", config.color.bg)}
          title={config.label}
        />
      );
    })}
    {chat.contact.tags.length > 2 && (
      <span className="text-xs text-muted-foreground">+{chat.contact.tags.length - 2}</span>
    )}
  </div>
)}
```

## Bestanden Overzicht

| Actie | Bestand | Beschrijving |
|-------|---------|--------------|
| CREATE | `src/lib/whatsapp-tags.ts` | Tag configuratie en kleuren |
| CREATE | `src/components/whatsapp/WhatsAppContactTags.tsx` | Tags component met add/remove |
| CREATE | `src/components/whatsapp/WhatsAppTagFilter.tsx` | Tag filter dropdown |
| CREATE | `src/hooks/whatsapp/useUpdateContactTags.ts` | Mutation voor tags update |
| EDIT | `src/components/whatsapp/WhatsAppContactProfile.tsx` | Integreer tags component |
| EDIT | `src/components/whatsapp/WhatsAppChatItem.tsx` | Toon tag indicators |
| EDIT | `src/components/whatsapp/WhatsAppChatList.tsx` | Voeg tag filter toe |
| EDIT | `src/hooks/whatsapp/useWhatsAppChats.ts` | Tag filter logica |
| EDIT | `src/types/whatsapp.ts` | Uitbreid filter type |
| EDIT | `src/pages/WhatsApp.tsx` | Prop doorgeving tag filter |

## Visueel Overzicht

```text
ChatList:
┌─────────────────────────────────────┐
│ 🔍 Zoek in gesprekken...            │
│ ─────────────────────────────────── │
│ [Alle] [Ongelezen 3] [Gekoppeld]    │
│ ─────────────────────────────────── │
│ [▼ Filter op label: Alle labels]   │  ← NIEUW
│ ═══════════════════════════════════ │
│ 👤 Jan de Vries                     │
│    Bedankt voor het bericht!        │
│    🟢🟡                             │  ← Tag indicators
│ ─────────────────────────────────── │
│ 👤 Marie                            │
│    Ik bel je zo terug               │
│    🔴                               │
└─────────────────────────────────────┘

ContactProfile Labels sectie:
┌─────────────────────────────────────┐
│  🏷️ LABELS                          │
│  [Cliënt ✕] [VIP ✕] [+ Label]       │
└─────────────────────────────────────┘
```

## Test Na Implementatie

1. Open een chat en open het profiel paneel
2. Klik "+ Label" → popover met beschikbare labels verschijnt
3. Klik op een label → label wordt toegevoegd, toast "Labels bijgewerkt"
4. Klik op X bij een label → confirm dialog verschijnt
5. Bevestig verwijderen → label wordt verwijderd
6. Controleer dat tag indicators zichtbaar zijn in chat list
7. Gebruik tag filter dropdown → alleen chats met dat label worden getoond
8. Ververs pagina → labels zijn persistent

