

# Soft Delete met Undo voor WhatsApp Chats

## Overzicht

Wijzig de "verwijder chat" functionaliteit naar een soft delete met undo-mogelijkheid via een toast notificatie. Dit voorkomt per ongeluk permanent verwijderen van chats.

## Huidige Situatie

| Component | Status |
|-----------|--------|
| `useDeleteChat` hook | Hard delete (permanent) |
| Context menu | "Chat verwijderen" + confirm dialog |
| `whatsapp_chats.deleted_at` kolom | Bestaat NIET |

## Implementatie Stappen

### 1. Database Migratie

Voeg `deleted_at` kolom toe aan `whatsapp_chats`:

```sql
ALTER TABLE whatsapp_chats 
ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
```

### 2. Update WhatsAppChat Type

**Bestand:** `src/types/whatsapp.ts`

Voeg `deleted_at` veld toe:

```typescript
export interface WhatsAppChat {
  // ... bestaande velden
  is_archived: boolean;
  deleted_at: string | null;  // NIEUW
  created_at: string;
  // ...
}
```

### 3. Herschrijf useDeleteChat Hook

**Bestand:** `src/hooks/whatsapp/useDeleteChat.ts`

Wijzig van hard delete naar soft delete met undo toast:

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useDeleteChat() {
  const queryClient = useQueryClient();

  const undoMutation = useMutation({
    mutationFn: async (chatId: string) => {
      const { error } = await supabase
        .from('whatsapp_chats')
        .update({ 
          is_archived: false, 
          deleted_at: null 
        })
        .eq('id', chatId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
      toast.success('Chat hersteld');
    },
    onError: (error) => {
      console.error('Failed to restore chat:', error);
      toast.error('Kon chat niet herstellen');
    },
  });

  return useMutation({
    mutationFn: async (chatId: string) => {
      // Soft delete: set is_archived = true, deleted_at = now()
      const { error } = await supabase
        .from('whatsapp_chats')
        .update({ 
          is_archived: true, 
          deleted_at: new Date().toISOString() 
        })
        .eq('id', chatId);

      if (error) throw error;
      return chatId;
    },
    onSuccess: (chatId) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
      
      // Toast met undo actie (5 seconden)
      toast.success('Chat gearchiveerd', {
        duration: 5000,
        action: {
          label: 'Ongedaan maken',
          onClick: () => undoMutation.mutate(chatId),
        },
      });
    },
    onError: (error) => {
      console.error('Failed to archive chat:', error);
      toast.error('Kon chat niet archiveren');
    },
  });
}
```

### 4. Vereenvoudig WhatsAppChatContextMenu

**Bestand:** `src/components/whatsapp/WhatsAppChatContextMenu.tsx`

Verwijderingslogica:
- Wijzig tekst "Chat verwijderen" → "Chat archiveren"
- Verwijder confirm dialog (niet meer nodig met undo)
- Roep direct `deleteChat.mutate()` aan

```tsx
// Verwijder useState voor deleteDialogOpen
// Verwijder AlertDialog component

// Wijzig menu item:
<ContextMenuItem 
  onClick={() => deleteChat.mutate(chat.id)}
  className="text-destructive focus:text-destructive"
>
  <Trash2 className="h-4 w-4 mr-2" />
  Chat archiveren
</ContextMenuItem>
```

### 5. Filter Logic (al correct)

De huidige `useWhatsAppChats` filtert al op `is_archived`:

```typescript
// Regel 66 - dit werkt al correct
result = result.filter(chat => !chat.is_archived);
```

## Bestanden Overzicht

| Actie | Bestand | Beschrijving |
|-------|---------|--------------|
| MIGRATE | Database | Voeg deleted_at kolom toe |
| EDIT | `src/types/whatsapp.ts` | Voeg deleted_at veld toe |
| EDIT | `src/hooks/whatsapp/useDeleteChat.ts` | Soft delete + undo toast |
| EDIT | `src/components/whatsapp/WhatsAppChatContextMenu.tsx` | Vereenvoudig, verwijder dialog |

## Flow Diagram

```text
Gebruiker klikt "Chat archiveren"
         ↓
useDeleteChat.mutate(chatId)
         ↓
UPDATE whatsapp_chats SET is_archived=true, deleted_at=now()
         ↓
Toast verschijnt: "Chat gearchiveerd" [Ongedaan maken]
         ↓
         ├── (5 sec wachten) → Toast verdwijnt, klaar
         │
         └── Gebruiker klikt "Ongedaan maken"
                    ↓
              undoMutation.mutate(chatId)
                    ↓
              UPDATE SET is_archived=false, deleted_at=null
                    ↓
              Toast: "Chat hersteld"
```

## Test Na Implementatie

1. Rechtermuisklik op een chat → menu toont "Chat archiveren"
2. Klik "Chat archiveren" → chat verdwijnt direct uit lijst
3. Toast verschijnt met "Chat gearchiveerd" en "Ongedaan maken" knop
4. Klik "Ongedaan maken" binnen 5 seconden → chat komt terug
5. Wacht 5 seconden zonder actie → toast verdwijnt
6. Ververs pagina → gearchiveerde chat blijft verborgen
7. Controleer database: is_archived=true, deleted_at is gevuld

