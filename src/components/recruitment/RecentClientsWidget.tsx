import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Mail, Phone, MapPin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { useState } from "react";

interface Client {
  id: string;
  name: string;
  company: string;
  org_id: string;
  created_at: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  regio?: string[] | null;
  sector?: string[] | null;
  doelgroep?: string[] | null;
  gezochte_functies?: string[] | null;
  organizations?: {
    name: string;
  };
}

interface RecentClientsWidgetProps {
  clients: Client[];
  isLoading?: boolean;
  onClientClick: (client: Client) => void;
}

export function RecentClientsWidget({ 
  clients, 
  isLoading = false, 
  onClientClick 
}: RecentClientsWidgetProps) {
  const recentClients = clients.slice(0, 5);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .slice(0, 2)
      .map(word => word[0])
      .join("")
      .toUpperCase();
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      "bg-blue-600",
      "bg-green-600",
      "bg-purple-600",
      "bg-orange-600",
      "bg-pink-600",
      "bg-indigo-600",
    ];
    const hash = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const getHumanizedTime = (createdAt: string) => {
    const now = new Date();
    const created = new Date(createdAt);
    const diffInHours = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return "Zojuist";
    if (diffInHours < 24) {
      const hours = now.getHours();
      const minutes = now.getMinutes();
      return `Vandaag ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    if (diffInHours < 48) return "Gisteren";
    
    return formatDistanceToNow(created, { addSuffix: true, locale: nl });
  };

  const [isOpen, setIsOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (recentClients.length === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full">
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
        Recente klanten ({recentClients.length})
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-1">
        {recentClients.map((client, index) => (
          <HoverCard key={client.id} openDelay={300}>
            <HoverCardTrigger asChild>
              <div
                className={`flex items-center gap-3 py-2 px-2 -mx-2 rounded-md cursor-pointer transition-all duration-200 hover:bg-accent/50 ${
                  index < recentClients.length - 1 ? "border-b border-border/30" : ""
                }`}
                onClick={() => onClientClick(client)}
              >
                <Avatar className={`${getAvatarColor(client.company)} h-8 w-8`}>
                  <AvatarFallback className="text-white text-xs font-semibold">
                    {getInitials(client.company)}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{client.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {client.company}
                  </p>
                </div>
                
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge 
                    variant="secondary"
                    className={`text-xs ${
                      client.organizations?.name === "ABCzorg" 
                        ? "bg-blue-600/10 text-blue-600 border-blue-600/20" 
                        : "bg-orange-500/10 text-orange-600 border-orange-500/20"
                    }`}
                  >
                    {client.organizations?.name || "Onbekend"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {getHumanizedTime(client.created_at)}
                  </span>
                </div>
              </div>
            </HoverCardTrigger>
            
            <HoverCardContent className="w-80" side="left">
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold mb-1">{client.company}</h4>
                  <p className="text-sm text-muted-foreground">{client.name}</p>
                </div>
                
                <div className="space-y-2 text-sm">
                  {client.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {client.phone}
                    </div>
                  )}
                  {client.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      {client.email}
                    </div>
                  )}
                  {client.address && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {client.address}
                    </div>
                  )}
                </div>
                
                {(client.regio || client.sector) && (
                  <div className="space-y-2 pt-2 border-t">
                    {client.regio && client.regio.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Regio's</p>
                        <div className="flex flex-wrap gap-1">
                          {client.regio.map((r) => (
                            <Badge key={r} variant="secondary" className="text-xs">
                              {r}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {client.sector && client.sector.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Sectoren</p>
                        <div className="flex flex-wrap gap-1">
                          {client.sector.map((s) => (
                            <Badge key={s} variant="outline" className="text-xs">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </HoverCardContent>
          </HoverCard>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
