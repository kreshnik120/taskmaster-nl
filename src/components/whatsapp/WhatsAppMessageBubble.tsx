import { useState } from "react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { WhatsAppStatusIcon } from "./WhatsAppStatusIcon";
import { WhatsAppImageLightbox } from "./WhatsAppImageLightbox";
import { FileText, Download, Loader2 } from "lucide-react";
import type { WhatsAppMessage, WhatsAppMedia } from "@/types/whatsapp";

interface WhatsAppMessageBubbleProps {
  message: WhatsAppMessage;
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function isDocumentMimeType(mimeType: string): boolean {
  return mimeType === 'application/pdf' || 
         mimeType.startsWith('application/') ||
         mimeType.startsWith('text/');
}

export function WhatsAppMessageBubble({ message }: WhatsAppMessageBubbleProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const isOutgoing = message.sender_type === 'self' || message.sender_type === 'user';
  const timestamp = format(parseISO(message.sent_at), 'HH:mm');

  // Filter media by type
  const hasMedia = message.media && message.media.length > 0;
  const imageMedia = hasMedia 
    ? message.media!.filter(m => isImageMimeType(m.mime_type))
    : [];
  const documentMedia = hasMedia 
    ? message.media!.filter(m => isDocumentMimeType(m.mime_type))
    : [];
  const otherMedia = hasMedia 
    ? message.media!.filter(m => !isImageMimeType(m.mime_type) && !isDocumentMimeType(m.mime_type))
    : [];

  return (
    <>
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
          {/* Image media */}
          {imageMedia.length > 0 && (
            <div className="mb-2 space-y-2">
              {imageMedia.map(media => (
                <img
                  key={media.id}
                  src={media.storage_url || ''}
                  alt={media.file_name}
                  className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  loading="lazy"
                  onClick={() => media.storage_url && setLightboxUrl(media.storage_url)}
                />
              ))}
            </div>
          )}

          {/* Document media */}
          {documentMedia.length > 0 && (
            <div className="mb-2 space-y-1">
              {documentMedia.map(media => (
                <a
                  key={media.id}
                  href={media.storage_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate flex-1">{media.file_name}</span>
                  <Download className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </a>
              ))}
            </div>
          )}

          {/* Other media (video, audio, etc.) */}
          {otherMedia.length > 0 && (
            <div className="mb-2 space-y-1">
              {otherMedia.map(media => (
                <a
                  key={media.id}
                  href={media.storage_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <Download className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">{media.file_name}</span>
                </a>
              ))}
            </div>
          )}

          {/* Loading state for media messages without loaded media */}
          {!hasMedia && ['image', 'video', 'audio', 'document'].includes(message.message_type) && (
            <div className="flex items-center gap-2 p-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm italic">Media wordt geladen...</span>
            </div>
          )}

          {/* Message content - filter out media placeholders */}
          {message.message_body && 
           message.message_body !== '[Media]' && 
           !message.message_body.startsWith('<media:') && (
            <p className="text-sm text-foreground whitespace-pre-wrap break-words">
              {message.message_body}
            </p>
          )}

          {/* Fallback for media without text */}
          {!message.message_body && !hasMedia && (
            <p className="text-sm text-muted-foreground italic">
              [Media bericht]
            </p>
          )}

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

      {/* Lightbox */}
      {lightboxUrl && (
        <WhatsAppImageLightbox
          imageUrl={lightboxUrl}
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </>
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
