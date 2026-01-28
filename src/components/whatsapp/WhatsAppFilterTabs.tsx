import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { WhatsAppFilter } from "@/types/whatsapp";

interface WhatsAppFilterTabsProps {
  filter: WhatsAppFilter;
  onFilterChange: (filter: WhatsAppFilter) => void;
  unreadCount: number;
}

export function WhatsAppFilterTabs({ filter, onFilterChange, unreadCount }: WhatsAppFilterTabsProps) {
  return (
    <Tabs 
      value={filter} 
      onValueChange={(value) => onFilterChange(value as WhatsAppFilter)}
      className="w-full"
    >
      <TabsList className="w-full grid grid-cols-3" aria-label="Filter chats">
        <TabsTrigger value="all" className="text-sm">
          Alle
        </TabsTrigger>
        <TabsTrigger value="unread" className="text-sm gap-1.5">
          Ongelezen
          {unreadCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-[#25D366] text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="linked" className="text-sm">
          Gekoppeld
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
