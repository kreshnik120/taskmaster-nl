import { MessageSquare } from "lucide-react";
import { useWhatsAppBackground, backgroundClasses } from "@/hooks/whatsapp/useWhatsAppBackground";
import { cn } from "@/lib/utils";

interface WhatsAppEmptyStateProps {
  stats?: {
    totalChats: number;
    unreadChats: number;
    linkedChats: number;
  };
}

export function WhatsAppEmptyState({ stats }: WhatsAppEmptyStateProps) {
  const { background } = useWhatsAppBackground();
  
  return (
    <div className={cn(
      "flex flex-col items-center justify-center h-full p-8",
      backgroundClasses[background]
    )}>
      <div className="rounded-full bg-[#25D366]/10 p-8 mb-6">
        <MessageSquare className="h-16 w-16 text-[#25D366]" />
      </div>
      
      <h2 className="text-2xl font-semibold mb-2 text-foreground">WhatsApp Inbox</h2>
      
      <p className="text-muted-foreground text-center max-w-md mb-8">
        Selecteer een gesprek om de berichten te bekijken.
        Nieuwe berichten van sollicitanten en professionals verschijnen automatisch.
      </p>

      {/* Quick stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-8">
          <div className="text-center">
            <p className="text-3xl font-bold text-[#25D366]">{stats.totalChats}</p>
            <p className="text-sm text-muted-foreground">Gesprekken</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-orange-500">{stats.unreadChats}</p>
            <p className="text-sm text-muted-foreground">Ongelezen</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-[#25D366]">{stats.linkedChats}</p>
            <p className="text-sm text-muted-foreground">Gekoppeld</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatListEmptyState({ searchQuery }: { searchQuery?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <MessageSquare className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-medium text-foreground mb-1">Geen chats gevonden</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        {searchQuery
          ? `Geen resultaten voor "${searchQuery}"`
          : 'Nieuwe berichten verschijnen hier automatisch.'}
      </p>
    </div>
  );
}
