import { Check, CheckCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageStatus } from "@/types/whatsapp";

interface WhatsAppStatusIconProps {
  status: MessageStatus;
  className?: string;
}

export function WhatsAppStatusIcon({ status, className }: WhatsAppStatusIconProps) {
  // No icon for received messages (incoming)
  if (status === 'received') {
    return null;
  }

  const iconClass = cn("h-3.5 w-3.5", className);

  switch (status) {
    case 'pending':
      return <Clock className={cn(iconClass, "text-muted-foreground")} />;
    case 'sent':
      return <Check className={cn(iconClass, "text-muted-foreground")} />;
    case 'delivered':
      return <CheckCheck className={cn(iconClass, "text-muted-foreground")} />;
    case 'read':
      return <CheckCheck className={cn(iconClass, "text-[#53bdeb]")} />;
    default:
      return null;
  }
}
