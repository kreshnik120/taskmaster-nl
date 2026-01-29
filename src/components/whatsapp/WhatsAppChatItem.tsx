import { format, isToday, isYesterday, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { WhatsAppContactAvatar } from "./WhatsAppContactAvatar";
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

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-3 cursor-pointer transition-colors border-b border-border/50",
        "hover:bg-accent/50",
        isSelected && "bg-accent border-l-2 border-l-primary"
      )}
    >
      {/* Avatar */}
      <WhatsAppContactAvatar
        contactId={chat.contact?.id}
        profilePictureUrl={chat.contact?.profile_picture_url}
        displayName={chat.contact?.display_name}
        pushName={chat.contact?.push_name}
        phoneNumber={chat.contact?.phone_number || 'Onbekend'}
        size="md"
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Top row: Name + Timestamp */}
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            "font-medium text-sm truncate",
            hasUnread && "text-foreground",
            !hasUnread && "text-foreground/80"
          )}>
            {displayName}
          </span>
          <span className={cn(
            "text-xs flex-shrink-0",
            hasUnread ? "text-[#25D366] font-medium" : "text-muted-foreground"
          )}>
            {formatTimestamp(chat.last_message_at)}
          </span>
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
              {chat.last_message_preview || 'Geen berichten'}
            </span>
          </div>

          {/* Unread badge */}
          {hasUnread && (
            <Badge 
              className="h-5 min-w-5 px-1.5 text-xs bg-[#25D366] text-white hover:bg-[#25D366] flex-shrink-0"
            >
              {chat.unread_count > 99 ? '99+' : chat.unread_count}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
