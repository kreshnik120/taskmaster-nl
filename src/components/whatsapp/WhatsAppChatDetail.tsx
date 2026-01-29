import { useRef, useEffect, useState } from "react";
import { ArrowLeft, MoreVertical, Copy, Archive, Send, MessageSquare, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { WhatsAppContactAvatar } from "./WhatsAppContactAvatar";
import { WhatsAppContactName } from "./WhatsAppContactName";
import { WhatsAppProfessionalDropdown } from "./WhatsAppProfessionalDropdown";
import { WhatsAppLinkedBanner } from "./WhatsAppLinkedBanner";
import { WhatsAppMessageBubble, DateDivider } from "./WhatsAppMessageBubble";
import { MessageSkeleton } from "./WhatsAppSkeletonLoader";
import { useWhatsAppMessages } from "@/hooks/whatsapp/useWhatsAppMessages";
import { useWhatsAppSendMessage } from "@/hooks/whatsapp/useWhatsAppSendMessage";
import type { WhatsAppChat } from "@/types/whatsapp";

interface WhatsAppChatDetailProps {
  chat: WhatsAppChat;
  onBack: () => void;
  showBackButton?: boolean;
  onToggleProfile?: () => void;
  showProfileButton?: boolean;
}

function formatPhone(phone: string | null | undefined): string {
  return phone || 'Onbekend nummer';
}

export function WhatsAppChatDetail({ chat, onBack, showBackButton = false, onToggleProfile, showProfileButton = false }: WhatsAppChatDetailProps) {
  const { messages, groupedByDate, isLoading } = useWhatsAppMessages(chat.id);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [newMessageAnnouncement, setNewMessageAnnouncement] = useState('');
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const displayName = chat.contact?.display_name || formatPhone(chat.contact?.phone_number);
  const phoneNumber = chat.contact?.phone_number;
  const chatJid = chat.chat_jid;

  // Send message mutation
  const sendMessage = useWhatsAppSendMessage({
    chatId: chat.id,
    chatJid,
    orgId: chat.org_id
  });

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sendMessage.isPending) return;

    try {
      await sendMessage.mutateAsync(text);
      setInputText('');
      // Focus back on input after sending
      inputRef.current?.focus();
    } catch (error) {
      // Error is handled in the mutation's onError
      console.error('[WhatsAppChatDetail] Send failed:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Announce new messages for screen readers
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.sender_type === 'contact') {
        setNewMessageAnnouncement(`Nieuw bericht van ${displayName}`);
        // Clear after announcement
        setTimeout(() => setNewMessageAnnouncement(''), 1000);
      }
    }
  }, [messages.length, displayName]);

  const handleCopyNumber = () => {
    if (phoneNumber) {
      navigator.clipboard.writeText(phoneNumber);
      toast.success('Telefoonnummer gekopieerd');
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#e5ddd5]">
      {/* Screen reader announcements */}
      <div 
        role="status" 
        aria-live="polite" 
        aria-atomic="true"
        className="sr-only"
      >
        {newMessageAnnouncement}
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-background border-b">
        {/* Back button (mobile) */}
        {showBackButton && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onBack}
            aria-label="Ga terug naar chatlijst"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}

        {/* Contact info */}
        <WhatsAppContactAvatar
          contactId={chat.contact?.id}
          profilePictureUrl={chat.contact?.profile_picture_url}
          displayName={chat.contact?.display_name}
          pushName={chat.contact?.push_name}
          phoneNumber={chat.contact?.phone_number || 'Onbekend'}
          size="md"
        />
        
        <div className="flex-1 min-w-0">
          <WhatsAppContactName
            contactId={chat.contact?.id || ''}
            displayName={chat.contact?.display_name}
            pushName={chat.contact?.push_name}
            phoneNumber={chat.contact?.phone_number || 'Onbekend'}
            editable={!!chat.contact?.id}
            size="md"
          />
          <p className="text-sm text-muted-foreground truncate">{formatPhone(phoneNumber)}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {showProfileButton && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleProfile}
              aria-label="Toggle contactprofiel"
            >
              <Info className="h-5 w-5" />
            </Button>
          )}
          
          <WhatsAppProfessionalDropdown
            chatId={chat.id}
            currentProfessionalId={chat.linked_professional_id}
            currentProfessionalName={chat.linked_professional?.full_name}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Meer acties">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-background border shadow-lg z-50">
              <DropdownMenuItem onClick={handleCopyNumber} className="gap-2">
                <Copy className="h-4 w-4" />
                Kopieer nummer
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" disabled>
                <Archive className="h-4 w-4" />
                Archiveer chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Linked professional banner */}
      {chat.linked_professional_id && chat.linked_professional && (
        <WhatsAppLinkedBanner
          chatId={chat.id}
          professionalId={chat.linked_professional_id}
          professionalName={chat.linked_professional.full_name}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <MessageSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">Nog geen berichten</p>
          </div>
        ) : (
          <div className="space-y-2">
            {groupedByDate.map((group) => (
              <div key={group.label}>
                <DateDivider label={group.label} />
                <div className="space-y-2">
                  {group.messages.map((message) => (
                    <WhatsAppMessageBubble key={message.id} message={message} />
                  ))}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message input */}
      <div className="p-4 bg-background border-t">
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            placeholder="Typ een bericht..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sendMessage.isPending}
            className="flex-1"
            aria-label="Typ een bericht"
          />
          <Button 
            size="icon" 
            onClick={handleSend}
            disabled={!inputText.trim() || sendMessage.isPending}
            aria-label="Verstuur bericht"
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
