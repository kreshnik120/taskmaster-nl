import { Pencil, Pin, BellOff, Volume2, Archive, Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useUpdateChatStatus } from "@/hooks/whatsapp/useUpdateChatStatus";
import { useDeleteChat } from "@/hooks/whatsapp/useDeleteChat";
import type { WhatsAppChat } from "@/types/whatsapp";

interface WhatsAppChatContextMenuProps {
  chat: WhatsAppChat;
  children: React.ReactNode;
  onRename: () => void;
}

export function WhatsAppChatContextMenu({ chat, children, onRename }: WhatsAppChatContextMenuProps) {
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
  };
  
  return (
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
          onClick={handleDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Chat archiveren
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
