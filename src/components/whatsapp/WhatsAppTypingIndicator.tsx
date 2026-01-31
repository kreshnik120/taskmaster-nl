import { cn } from "@/lib/utils";

interface WhatsAppTypingIndicatorProps {
  contactName?: string | null;
  className?: string;
}

/**
 * Animated typing indicator with bouncing dots.
 * Shows "[Name] is aan het typen..." when contact is typing.
 */
export function WhatsAppTypingIndicator({ 
  contactName, 
  className 
}: WhatsAppTypingIndicatorProps) {
  return (
    <div 
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-1">
        <TypingDots />
      </div>
      <span className="italic">
        {contactName ? `${contactName} is aan het typen...` : "Aan het typen..."}
      </span>
    </div>
  );
}

/**
 * Animated bouncing dots for typing indicator.
 */
function TypingDots() {
  return (
    <div className="flex items-center gap-0.5">
      <span 
        className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" 
        style={{ animationDelay: "0ms", animationDuration: "600ms" }} 
      />
      <span 
        className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" 
        style={{ animationDelay: "150ms", animationDuration: "600ms" }} 
      />
      <span 
        className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" 
        style={{ animationDelay: "300ms", animationDuration: "600ms" }} 
      />
    </div>
  );
}
