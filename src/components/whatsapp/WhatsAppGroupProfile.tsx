import { X, Pin, BellOff, Volume2, Archive, Users, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WhatsAppContactAvatar } from "./WhatsAppContactAvatar";
import { useWhatsAppGroupMembers } from "@/hooks/whatsapp/useWhatsAppGroupMembers";
import { useUpdateChatStatus } from "@/hooks/whatsapp/useUpdateChatStatus";
import { cn } from "@/lib/utils";
import type { WhatsAppChat } from "@/types/whatsapp";

interface WhatsAppGroupProfileProps {
  chat: WhatsAppChat;
  onClose: () => void;
}

export function WhatsAppGroupProfile({ chat, onClose }: WhatsAppGroupProfileProps) {
  const navigate = useNavigate();
  const { data: members, isLoading } = useWhatsAppGroupMembers(chat.id);
  const updateStatus = useUpdateChatStatus();
  
  const groupName = chat.contact?.display_name || chat.contact?.push_name || 'Groep';
  const memberCount = members?.length || 0;

  const handlePin = () => {
    updateStatus.mutate({
      chatId: chat.id,
      field: 'is_pinned',
      value: !chat.is_pinned,
    });
  };

  const handleMute = () => {
    updateStatus.mutate({
      chatId: chat.id,
      field: 'is_muted',
      value: !chat.is_muted,
    });
  };

  const handleArchive = () => {
    updateStatus.mutate({
      chatId: chat.id,
      field: 'is_archived',
      value: true,
    });
    onClose();
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-medium">Groepsinfo</h3>
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
      <ScrollArea className="flex-1">
        {/* Group hero */}
        <div className="flex flex-col items-center py-6 px-4">
          <WhatsAppContactAvatar
            contactId={chat.contact?.id}
            profilePictureUrl={chat.contact?.profile_picture_url}
            displayName={groupName}
            phoneNumber={chat.chat_jid}
            size="xl"
            isGroup={true}
          />
          
          <h2 className="mt-4 text-lg font-semibold text-center">
            {groupName}
          </h2>
          
          <span className="text-sm text-muted-foreground mt-1">
            {memberCount} deelnemer{memberCount !== 1 ? 's' : ''}
          </span>
        </div>

        <Separator />

        {/* Members section */}
        <div className="px-4 py-4 space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Users className="h-3.5 w-3.5" />
            Deelnemers ({memberCount})
          </h4>
          
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                  <div className="h-10 w-10 rounded-full bg-muted" />
                  <div className="h-4 w-24 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : memberCount === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Geen deelnemers gevonden. Stuur een bericht om leden te registreren.
            </p>
          ) : (
            <div className="space-y-1">
              {members?.map((member) => (
                <div
                  key={member.id}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-lg transition-colors",
                    member.direct_chat_id 
                      ? "hover:bg-muted/50 cursor-pointer" 
                      : "hover:bg-muted/30"
                  )}
                  onClick={() => {
                    if (member.direct_chat_id) {
                      navigate(`/whatsapp/chat/${member.direct_chat_id}`);
                      onClose();
                    }
                  }}
                >
                  <WhatsAppContactAvatar
                    contactId={member.contact_id || undefined}
                    displayName={member.display_name}
                    phoneNumber={member.member_jid}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {member.display_name || member.member_jid}
                      {member.is_self && (
                        <span className="ml-2 text-xs text-muted-foreground">(Jij)</span>
                      )}
                    </p>
                    {member.role !== 'member' && (
                      <p className="text-xs text-muted-foreground capitalize">
                        {member.role === 'superadmin' ? 'Beheerder' : 'Admin'}
                      </p>
                    )}
                  </div>
                  {member.direct_chat_id && (
                    <MessageCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Actions section */}
        <div className="px-4 py-4 space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Acties
          </h4>
          <div className="space-y-1.5">
            <Button variant="outline" className="w-full justify-start" onClick={handlePin}>
              {chat.is_pinned ? (
                <>
                  <Pin className="h-4 w-4 mr-2" />
                  Groep losmaken
                </>
              ) : (
                <>
                  <Pin className="h-4 w-4 mr-2" />
                  Pin groep
                </>
              )}
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={handleMute}>
              {chat.is_muted ? (
                <>
                  <Volume2 className="h-4 w-4 mr-2" />
                  Unmute groep
                </>
              ) : (
                <>
                  <BellOff className="h-4 w-4 mr-2" />
                  Mute groep
                </>
              )}
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={handleArchive}>
              <Archive className="h-4 w-4 mr-2" />
              Archiveer
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
