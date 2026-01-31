import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WhatsAppScrollToBottomProps {
  visible: boolean;
  unreadCount?: number;
  onClick: () => void;
}

export function WhatsAppScrollToBottom({ 
  visible, 
  unreadCount = 0, 
  onClick 
}: WhatsAppScrollToBottomProps) {
  if (!visible) return null;

  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={onClick}
      className={cn(
        "absolute bottom-20 right-4 z-10 rounded-full shadow-lg",
        "bg-background border border-border hover:bg-muted",
        "h-10 w-10 transition-all duration-200",
        "animate-fade-in"
      )}
      aria-label="Scroll naar nieuwste berichten"
    >
      <ChevronDown className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center rounded-full bg-[#25D366] text-white text-xs font-medium">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Button>
  );
}
