import { format, isToday, isYesterday, parseISO, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Check, Pin, BellOff, Users, Phone, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { WhatsAppContactAvatar } from "./WhatsAppContactAvatar";
import { getTagConfig } from "@/lib/whatsapp-tags";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { WhatsAppChat } from "@/types/whatsapp";

interface WhatsAppChatItemProps {
  chat: WhatsAppChat;
  isSelected: boolean;
  onClick: () => void;
}

function formatPhone(phone: string): string {
  // Format phone number for display (e.g., +31 6 12345678)
  if (phone.startsWith('+')) {
    return phone;
  }
  return phone;
}

function formatTimestamp(dateStr: string | null): string {
  if (!dateStr) return '';
  
  const date = parseISO(dateStr);
  
  if (isToday(date)) {
    return format(date, 'HH:mm');
  }
  
  if (isYesterday(date)) {
    return 'Gisteren';
  }
  
  return format(date, 'd MMM', { locale: nl });
}

export function WhatsAppChatItem({ chat, isSelected, onClick }: WhatsAppChatItemProps) {
  const displayName = chat.contact?.display_name || formatPhone(chat.contact?.phone_number || 'Onbekend');
  const hasUnread = chat.unread_count > 0;
  const isLinked = !!chat.linked_professional_id;
  const isPinned = chat.is_pinned;
  const isMuted = chat.is_muted;
  const isGroup = chat.chat_type === 'group';
  const phoneNumber = chat.contact?.phone_number;
  
  const lastActiveText = chat.last_message_at 
    ? formatDistanceToNow(parseISO(chat.last_message_at), { addSuffix: true, locale: nl })
    : 'Onbekend';

  return (
    <HoverCard openDelay={400} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div
          onClick={onClick}
          className={cn(
            "flex items-center gap-3 p-3 cursor-pointer border-b border-border/50",
            "glass-list-item-blue",
            "active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:outline-none",
            isSelected && "bg-blue-50/80 dark:bg-blue-900/40 border-l-[3px] border-l-[#25D366] shadow-[0_0_12px_hsla(217,91%,60%,0.08)]",
            isMuted && "opacity-60"
          )}
        >
          {/* Avatar */}
          <WhatsAppContactAvatar
            contactId={chat.contact?.id}
            profilePictureUrl={chat.contact?.profile_picture_url}
            displayName={chat.contact?.display_name}
            pushName={chat.contact?.push_name}
            phoneNumber={chat.contact?.phone_number || 'Onbekend'}
            lastActiveAt={chat.last_message_at}
            size="md"
            showOnlineStatus={true}
            isGroup={isGroup}
          />

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Top row: Name + Timestamp */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {/* Group indicator */}
                {isGroup && (
                  <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                )}
                {/* Pin indicator */}
                {isPinned && (
                  <Pin className="h-3 w-3 text-muted-foreground flex-shrink-0 transition-transform duration-200" />
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

            {/* Bottom row: Preview + Badge */}
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {/* Linked indicator */}
                {isLinked && (
                  <div className="flex items-center gap-0.5 text-[#25D366] flex-shrink-0">
                    <Check className="h-3 w-3" />
                  </div>
                )}
                {/* Message preview */}
                <span className={cn(
                  "text-sm truncate",
                  hasUnread ? "text-foreground/80" : "text-muted-foreground"
                )}>
                  {(() => {
                    const preview = chat.last_message_preview;
                    if (!preview) return 'Geen berichten';
                    if (preview === '[Media]' || preview.startsWith('<media:')) return '📷 Afbeelding';
                    return preview;
                  })()}
                </span>
              </div>

              {/* Unread badge */}
              {hasUnread && (
                <Badge 
                  className={cn(
                    "h-5 min-w-5 px-1.5 text-xs bg-[#25D366] text-white hover:bg-[#25D366] flex-shrink-0",
                    "animate-badge-pop"
                  )}
                >
                  {chat.unread_count > 99 ? '99+' : chat.unread_count}
                </Badge>
              )}
            </div>

            {/* Tag indicators */}
            {chat.contact?.tags && chat.contact.tags.length > 0 && (
              <div className="flex gap-1 mt-1">
                {chat.contact.tags.slice(0, 3).map(tagId => {
                  const config = getTagConfig(tagId);
                  if (!config) return null;
                  return (
                    <div 
                      key={tagId}
                      className={cn(
                        "w-2 h-2 rounded-full", 
                        config.color.bg,
                        config.color.border,
                        "border"
                      )}
                      title={config.label}
                    />
                  );
                })}
                {chat.contact.tags.length > 3 && (
                  <span className="text-xs text-muted-foreground">+{chat.contact.tags.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </HoverCardTrigger>
      
      {/* Hover Preview Card */}
      <HoverCardContent 
        side="right" 
        align="start" 
        className="w-64 p-3 shadow-[0_8px_32px_hsla(217,91%,60%,0.12)]"
        sideOffset={8}
      >
        <div className="space-y-2">
          {/* Phone number */}
          {phoneNumber && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-foreground">{phoneNumber}</span>
            </div>
          )}
          
          {/* Last activity */}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Laatste bericht {lastActiveText}</span>
          </div>
          
          {/* Status indicators */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t border-border/50">
            {isPinned && (
              <span className="flex items-center gap-1">
                <Pin className="h-3 w-3" /> Gepind
              </span>
            )}
            {isMuted ? (
              <span className="flex items-center gap-1">
                <BellOff className="h-3 w-3" /> Gedempt
              </span>
            ) : (
              <span>🔔 Meldingen aan</span>
            )}
            {isLinked && (
              <span className="flex items-center gap-1 text-[#25D366]">
                <Check className="h-3 w-3" /> Gekoppeld
              </span>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
