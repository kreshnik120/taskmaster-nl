import { cn } from "@/lib/utils";

interface WhatsAppQuoteBoxProps {
  preview: string;
  senderName?: string | null;
  className?: string;
}

export function WhatsAppQuoteBox({ preview, senderName, className }: WhatsAppQuoteBoxProps) {
  return (
    <div className={cn(
      "border-l-4 border-primary/50 bg-muted/30 rounded-r-lg px-2 py-1.5 mb-2",
      className
    )}>
      {senderName && (
        <p className="text-xs font-medium text-primary truncate mb-0.5">
          {senderName}
        </p>
      )}
      <p className="text-xs text-muted-foreground line-clamp-2">
        {preview}
      </p>
    </div>
  );
}
