import { X, Copy, Pin, BellOff, Archive, Bot, Ban, Info, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { WhatsAppContactAvatar } from "./WhatsAppContactAvatar";
import { WhatsAppContactName } from "./WhatsAppContactName";
import { WhatsAppContactTags } from "./WhatsAppContactTags";
import { WhatsAppContactNotes } from "./WhatsAppContactNotes";
import { useWhatsAppContact } from "@/hooks/whatsapp/useWhatsAppContact";
import type { WhatsAppChat } from "@/types/whatsapp";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

interface WhatsAppContactProfileProps {
  chat: WhatsAppChat;
  onClose: () => void;
}

function formatPhone(phone: string | null | undefined): string {
  return phone || 'Onbekend nummer';
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Onbekend';
  try {
    return formatDistanceToNow(new Date(dateString), { 
      addSuffix: true,
      locale: nl 
    });
  } catch {
    return 'Onbekend';
  }
}

export function WhatsAppContactProfile({ chat, onClose }: WhatsAppContactProfileProps) {
  const { data: contact } = useWhatsAppContact(chat.contact?.id);
  
  // Use chat.contact as fallback if contact query hasn't loaded yet
  const displayContact = contact || chat.contact;
  const phoneNumber = displayContact?.phone_number;

  const handleCopyNumber = () => {
    if (phoneNumber) {
      navigator.clipboard.writeText(phoneNumber);
      toast.success('Telefoonnummer gekopieerd');
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-medium">Contactprofiel</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Sluit profiel"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Contact hero */}
        <div className="flex flex-col items-center py-6 px-4">
          <WhatsAppContactAvatar
            contactId={displayContact?.id}
            profilePictureUrl={displayContact?.profile_picture_url}
            displayName={displayContact?.display_name}
            pushName={displayContact?.push_name}
            phoneNumber={phoneNumber || 'Onbekend'}
            size="xl"
          />
          
          <div className="mt-4 text-center w-full">
            <WhatsAppContactName
              contactId={displayContact?.id || ''}
              displayName={displayContact?.display_name}
              pushName={displayContact?.push_name}
              phoneNumber={phoneNumber || 'Onbekend'}
              editable={!!displayContact?.id}
              size="lg"
            />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm text-muted-foreground">
              {formatPhone(phoneNumber)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleCopyNumber}
              aria-label="Kopieer telefoonnummer"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <Separator />

        {/* Info section */}
        <div className="px-4 py-4 space-y-4">
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Info className="h-3.5 w-3.5" />
              Info
            </h4>
            <div className="space-y-1.5 text-sm">
              {displayContact?.push_name && displayContact.push_name !== displayContact.display_name && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WhatsApp naam</span>
                  <span>{displayContact.push_name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span>{contact?.is_business_account ? 'Zakelijk' : 'Persoonlijk'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Laatst actief</span>
                <span>{formatRelativeTime(chat.last_message_at)}</span>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Labels section */}
        <div className="px-4 py-4 space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Tag className="h-3.5 w-3.5" />
            Labels
          </h4>
          <WhatsAppContactTags
            contactId={displayContact?.id || ''}
            tags={displayContact?.tags || []}
            editable={!!displayContact?.id}
          />
        </div>

        <Separator />

        {/* Notes section */}
        <div className="px-4 py-4">
          <WhatsAppContactNotes
            contactId={displayContact?.id || ''}
            notes={displayContact?.contact_notes || null}
            editable={!!displayContact?.id}
          />
        </div>

        <Separator />

        {/* Actions section */}
        <div className="px-4 py-4 space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Acties
          </h4>
          <div className="space-y-1.5">
            <Button variant="outline" className="w-full justify-start" disabled>
              <Bot className="h-4 w-4 mr-2" />
              AI antwoorden
            </Button>
            <Button variant="outline" className="w-full justify-start" disabled>
              <Pin className="h-4 w-4 mr-2" />
              Pin chat
            </Button>
            <Button variant="outline" className="w-full justify-start" disabled>
              <BellOff className="h-4 w-4 mr-2" />
              Mute chat
            </Button>
            <Button variant="outline" className="w-full justify-start" disabled>
              <Archive className="h-4 w-4 mr-2" />
              Archiveer
            </Button>
            
            <Separator className="my-2" />
            
            <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive" disabled>
              <Ban className="h-4 w-4 mr-2" />
              Niet meer contacteren
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
