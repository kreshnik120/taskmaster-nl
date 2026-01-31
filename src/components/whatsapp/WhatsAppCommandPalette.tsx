import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  MessageCircle,
  Pin,
  BellOff,
  Archive,
  Filter,
  Users,
  Building2,
  Briefcase,
  Navigation,
  Link,
} from "lucide-react";
import { useUpdateChatStatus } from "@/hooks/whatsapp/useUpdateChatStatus";
import type { WhatsAppChat, WhatsAppFilter } from "@/types/whatsapp";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

interface WhatsAppCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chats: WhatsAppChat[];
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onFilterChange: (filter: WhatsAppFilter) => void;
  currentFilter: WhatsAppFilter;
}

export function WhatsAppCommandPalette({
  open,
  onOpenChange,
  chats,
  selectedChatId,
  onSelectChat,
  onFilterChange,
  currentFilter,
}: WhatsAppCommandPaletteProps) {
  const navigate = useNavigate();
  const updateStatus = useUpdateChatStatus();

  // Find selected chat for actions
  const selectedChat = useMemo(() => {
    if (!selectedChatId) return null;
    return chats.find((c) => c.id === selectedChatId) || null;
  }, [chats, selectedChatId]);

  const hasSelectedChat = !!selectedChatId && !!selectedChat;

  // Chat selection handler
  const handleSelectChat = useCallback(
    (chatId: string) => {
      onSelectChat(chatId);
      onOpenChange(false);
    },
    [onSelectChat, onOpenChange]
  );

  // Action handlers
  const handlePinChat = useCallback(() => {
    if (!selectedChatId || !selectedChat) return;
    updateStatus.mutate({
      chatId: selectedChatId,
      field: "is_pinned",
      value: !selectedChat.is_pinned,
    });
    onOpenChange(false);
  }, [selectedChatId, selectedChat, updateStatus, onOpenChange]);

  const handleMuteChat = useCallback(() => {
    if (!selectedChatId || !selectedChat) return;
    updateStatus.mutate({
      chatId: selectedChatId,
      field: "is_muted",
      value: !selectedChat.is_muted,
    });
    onOpenChange(false);
  }, [selectedChatId, selectedChat, updateStatus, onOpenChange]);

  const handleArchiveChat = useCallback(() => {
    if (!selectedChatId || !selectedChat) return;
    updateStatus.mutate({
      chatId: selectedChatId,
      field: "is_archived",
      value: true,
    });
    onOpenChange(false);
  }, [selectedChatId, selectedChat, updateStatus, onOpenChange]);

  // Filter handlers
  const handleFilterChange = useCallback(
    (filter: WhatsAppFilter) => {
      onFilterChange(filter);
      onOpenChange(false);
    },
    [onFilterChange, onOpenChange]
  );

  // Navigation handlers
  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
      onOpenChange(false);
    },
    [navigate, onOpenChange]
  );

  // Filter items
  const filterItems = [
    { label: "Toon alle chats", filter: "all" as WhatsAppFilter },
    { label: "Toon ongelezen", filter: "unread" as WhatsAppFilter },
    { label: "Toon gekoppelde", filter: "linked" as WhatsAppFilter },
  ];

  // Navigation items
  const navigationItems = [
    { label: "Ga naar Professionals", path: "/professionals", icon: Users },
    { label: "Ga naar Klanten", path: "/klanten", icon: Building2 },
    { label: "Ga naar Plaatsingen", path: "/plaatsingen", icon: Briefcase },
  ];

  // Get display name for chat
  const getChatDisplayName = (chat: WhatsAppChat) => {
    return (
      chat.contact?.display_name ||
      chat.contact?.push_name ||
      chat.contact?.phone_number ||
      "Onbekend"
    );
  };

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Zoek chats, acties..." />
      <CommandList>
        <CommandEmpty>Geen resultaten gevonden</CommandEmpty>

        {/* Chats Group */}
        {chats.length > 0 && (
          <CommandGroup heading="Chats">
            {chats.slice(0, 10).map((chat) => {
              const displayName = getChatDisplayName(chat);
              return (
                <CommandItem
                  key={chat.id}
                  value={`chat-${displayName}`}
                  onSelect={() => handleSelectChat(chat.id)}
                  className="flex items-center gap-3"
                >
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage
                      src={chat.contact?.profile_picture_url || undefined}
                      alt={displayName}
                    />
                    <AvatarFallback className="text-xs">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-medium truncate">{displayName}</span>
                    {chat.last_message_preview && (
                      <span className="text-xs text-muted-foreground truncate">
                        {chat.last_message_preview}
                      </span>
                    )}
                  </div>
                  {chat.unread_count > 0 && (
                    <span className="flex-shrink-0 h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                      {chat.unread_count}
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* Actions Group */}
        <CommandGroup heading="Acties">
          <CommandItem
            value="pin-chat"
            onSelect={handlePinChat}
            disabled={!hasSelectedChat}
            className={cn(!hasSelectedChat && "opacity-50 cursor-not-allowed")}
          >
            <Pin className="mr-2 h-4 w-4" />
            <span>
              {selectedChat?.is_pinned ? "Losmaken" : "Pin"} huidige chat
            </span>
            <CommandShortcut>{mod}P</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="mute-chat"
            onSelect={handleMuteChat}
            disabled={!hasSelectedChat}
            className={cn(!hasSelectedChat && "opacity-50 cursor-not-allowed")}
          >
            <BellOff className="mr-2 h-4 w-4" />
            <span>
              {selectedChat?.is_muted ? "Demping opheffen" : "Mute"} huidige
              chat
            </span>
            <CommandShortcut>{mod}M</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="archive-chat"
            onSelect={handleArchiveChat}
            disabled={!hasSelectedChat}
            className={cn(!hasSelectedChat && "opacity-50 cursor-not-allowed")}
          >
            <Archive className="mr-2 h-4 w-4" />
            <span>Archiveer chat</span>
            <CommandShortcut>{mod}⇧A</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="link-task"
            onSelect={() => {
              toast.info("Taakkoppeling komt in een latere fase");
              onOpenChange(false);
            }}
            disabled={!hasSelectedChat}
            className={cn(!hasSelectedChat && "opacity-50 cursor-not-allowed")}
          >
            <Link className="mr-2 h-4 w-4" />
            <span>Koppel aan taak</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Filters Group */}
        <CommandGroup heading="Filters">
          {filterItems.map((item) => (
            <CommandItem
              key={item.filter}
              value={`filter-${item.filter}`}
              onSelect={() => handleFilterChange(item.filter)}
              className={cn(
                currentFilter === item.filter && "bg-accent"
              )}
            >
              <Filter className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
              {currentFilter === item.filter && (
                <span className="ml-auto text-xs text-muted-foreground">
                  Actief
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Navigation Group */}
        <CommandGroup heading="Navigatie">
          {navigationItems.map((item) => (
            <CommandItem
              key={item.path}
              value={`nav-${item.label}`}
              onSelect={() => handleNavigate(item.path)}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
