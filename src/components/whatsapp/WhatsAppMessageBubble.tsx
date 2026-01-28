import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { WhatsAppStatusIcon } from "./WhatsAppStatusIcon";
import type { WhatsAppMessage } from "@/types/whatsapp";

interface WhatsAppMessageBubbleProps {
  message: WhatsAppMessage;
}

export function WhatsAppMessageBubble({ message }: WhatsAppMessageBubbleProps) {
  const isOutgoing = message.sender_type === 'self';
  const timestamp = format(parseISO(message.sent_at), 'HH:mm');

  return (
    <div
      className={cn(
        "flex",
        isOutgoing ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[75%] px-3 py-2 rounded-2xl shadow-sm",
          isOutgoing 
            ? "bg-[#dcf8c6] rounded-br-none" 
            : "bg-background rounded-bl-none border border-border"
        )}
      >
        {/* Message content */}
        <p className="text-sm text-foreground whitespace-pre-wrap break-words">
          {message.message_body || '[Media bericht]'}
        </p>

        {/* Timestamp and status */}
        <div className={cn(
          "flex items-center gap-1 mt-1",
          isOutgoing ? "justify-end" : "justify-start"
        )}>
          <span className="text-[10px] text-muted-foreground">
            {timestamp}
          </span>
          {isOutgoing && (
            <WhatsAppStatusIcon status={message.status} />
          )}
        </div>
      </div>
    </div>
  );
}

interface DateDividerProps {
  label: string;
}

export function DateDivider({ label }: DateDividerProps) {
  return (
    <div className="flex items-center justify-center my-4">
      <div className="bg-muted/80 text-muted-foreground text-xs px-3 py-1 rounded-full shadow-sm">
        {label}
      </div>
    </div>
  );
}
