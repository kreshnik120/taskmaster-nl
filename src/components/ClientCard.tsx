import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Phone, Mail, MapPin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { motion } from "framer-motion";

interface ClientCardProps {
  client: {
    id: string;
    name: string;
    company: string;
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
  };
  searchQuery?: string;
  onClick: (client: any) => void;
  onQuickCall?: () => void;
  onQuickEmail?: () => void;
  groupType?: "bureau" | "sector" | "matching" | "regio" | "alpha";
  index?: number;
}

export function ClientCard({ client, searchQuery = "", onClick, onQuickCall, onQuickEmail, groupType, index = 0 }: ClientCardProps) {
  const hasMatchingData = (client.regio && client.regio.length > 0) ||
    (client.sector && client.sector.length > 0) ||
    (client.doelgroep && client.doelgroep.length > 0) ||
    (client.gezochte_functies && client.gezochte_functies.length > 0);

  // Avatar initials
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .slice(0, 2)
      .map(word => word[0])
      .join("")
      .toUpperCase();
  };

  // Avatar color based on sector (semantic meaning for healthcare staffing)
  const getSectorAvatarColor = () => {
    if (client.sector && client.sector.length > 0) {
      const sector = client.sector[0];
      switch (sector) {
        case "GGZ": return "bg-blue-600";
        case "GHZ": return "bg-emerald-600";
        case "Jeugdzorg": return "bg-orange-500";
        case "VVT": return "bg-purple-600";
        case "Ziekenhuis": return "bg-red-500";
        case "Thuiszorg": return "bg-cyan-600";
        default: return "bg-slate-500";
      }
    }
    // Fallback: neutral gray for clients without sector
    return "bg-slate-400";
  };

  // Highlight matching text
  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-primary/20 text-foreground font-medium">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  // Time indicator
  const getTimeIndicator = (createdAt: string) => {
    const distance = formatDistanceToNow(new Date(createdAt), { 
      addSuffix: false, 
      locale: nl 
    });
    
    const now = new Date();
    const created = new Date(createdAt);
    const diffInDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return "Toegevoegd vandaag";
    if (diffInDays === 1) return "Toegevoegd gisteren";
    return `${distance} geleden`;
  };

  // Matching completeness
  const completenessScore = [
    client.regio && client.regio.length > 0,
    client.sector && client.sector.length > 0,
    client.doelgroep && client.doelgroep.length > 0,
    client.gezochte_functies && client.gezochte_functies.length > 0,
  ].filter(Boolean).length;

  const hasCompleteMatchingData = completenessScore === 4;
  const hasPartialMatchingData = completenessScore > 0 && completenessScore < 4;

  // Visual weight based on completeness (opacity hierarchy)
  const cardOpacity = completenessScore === 0 ? "opacity-70" : 
                      completenessScore === 1 ? "opacity-80" : 
                      completenessScore === 2 ? "opacity-90" : 
                      "opacity-100";

  // Removed: sector border is now redundant as sector is shown via avatar color

  const handleQuickCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (client.phone) {
      window.location.href = `tel:${client.phone}`;
    }
  };

  const handleQuickEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (client.email) {
      window.location.href = `mailto:${client.email}`;
    }
  };

  const handleQuickMap = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (client.address) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`, '_blank');
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(client);
  };

  return (
    <HoverCard openDelay={300}>
      <HoverCardTrigger asChild>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ 
            duration: 0.3, 
            delay: index * 0.05,
            ease: [0.4, 0, 0.2, 1]
          }}
        >
          <Card 
            className={`cursor-pointer transition-all duration-200 hover:bg-muted/30 hover:shadow-md hover:-translate-y-0.5 ${cardOpacity} flex flex-col overflow-hidden`}
            onClick={() => onClick(client)}
          >
          {/* Main content */}
          <CardContent className="p-3 flex-1">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarFallback className={getSectorAvatarColor()}>
                  {getInitials(client.company)}
                </AvatarFallback>
              </Avatar>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Header with name and progress ring */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-sm truncate">
                    {highlightText(client.name, searchQuery)}
                  </h3>
                  <div className="flex items-center gap-2">
                    {/* Matching Progress Ring */}
                    {groupType !== "matching" && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16">
                              <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted" />
                              {completenessScore >= 1 && (
                                <path d="M 8,1 A 7,7 0 0,1 15,8" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500" />
                              )}
                              {completenessScore >= 2 && (
                                <path d="M 15,8 A 7,7 0 0,1 8,15" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500" />
                              )}
                              {completenessScore >= 3 && (
                                <path d="M 8,15 A 7,7 0 0,1 1,8" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500" />
                              )}
                              {completenessScore === 4 && (
                                <path d="M 1,8 A 7,7 0 0,1 8,1" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500" />
                              )}
                            </svg>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <div className="text-xs space-y-0.5">
                              <div className={client.regio && client.regio.length > 0 ? "text-green-500" : "text-muted-foreground"}>
                                {client.regio && client.regio.length > 0 ? "✓" : "○"} Regio
                              </div>
                              <div className={client.sector && client.sector.length > 0 ? "text-green-500" : "text-muted-foreground"}>
                                {client.sector && client.sector.length > 0 ? "✓" : "○"} Sector
                              </div>
                              <div className={client.doelgroep && client.doelgroep.length > 0 ? "text-green-500" : "text-muted-foreground"}>
                                {client.doelgroep && client.doelgroep.length > 0 ? "✓" : "○"} Doelgroep
                              </div>
                              <div className={client.gezochte_functies && client.gezochte_functies.length > 0 ? "text-green-500" : "text-muted-foreground"}>
                                {client.gezochte_functies && client.gezochte_functies.length > 0 ? "✓" : "○"} Functies
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {groupType !== "bureau" && client.organizations?.name && (
                      <Badge 
                        variant="secondary" 
                        className={`text-xs ${client.organizations.name === 'ABCzorg' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}
                      >
                        {client.organizations.name}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Metadata line - single line with bullets or enhanced empty state */}
                <div className="text-xs text-muted-foreground">
                  {client.regio && client.regio.length > 0 && client.sector && client.sector.length > 0 ? (
                    [client.regio[0], client.sector[0]].join(' • ')
                  ) : client.regio && client.regio.length > 0 ? (
                    client.regio[0]
                  ) : client.sector && client.sector.length > 0 ? (
                    client.sector[0]
                  ) : (
                    <button
                      onClick={handleEditClick}
                      className="italic text-muted-foreground hover:text-primary transition-colors"
                    >
                      Voeg data toe →
                    </button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>

          {/* Always visible action footer */}
          <div className="border-t border-border/50 px-3 py-2 flex items-center gap-1 bg-muted/20">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleQuickCall}
                    disabled={!client.phone}
                    className="h-7 px-2 disabled:opacity-40 hover:scale-105 hover:bg-primary/10 transition-all duration-200"
                  >
                    <Phone className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {client.phone ? "Bel klant" : "Geen telefoonnummer"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleQuickEmail}
                    disabled={!client.email}
                    className="h-7 px-2 disabled:opacity-40 hover:scale-105 hover:bg-primary/10 transition-all duration-200"
                  >
                    <Mail className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {client.email ? "Email klant" : "Geen email adres"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleQuickMap}
                    disabled={!client.address}
                    className="h-7 px-2 disabled:opacity-40 hover:scale-105 hover:bg-primary/10 transition-all duration-200"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {client.address ? "Bekijk op kaart" : "Geen adres"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </Card>
        </motion.div>
      </HoverCardTrigger>
      
      <HoverCardContent className="w-80" side="top">
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
          
          {hasMatchingData && (
            <div className="space-y-2 pt-2 border-t">
              {client.sector && client.sector.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Sectoren</p>
                  <div className="flex flex-wrap gap-1">
                    {client.sector.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {client.doelgroep && client.doelgroep.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Doelgroepen</p>
                  <div className="flex flex-wrap gap-1">
                    {client.doelgroep.map((d) => (
                      <Badge key={d} variant="outline" className="text-xs">
                        {d}
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
  );
}

// Skeleton variant
export function ClientCardSkeleton() {
  return (
    <Card className="flex flex-col">
      <CardContent className="p-3 flex-1">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </CardContent>
      <div className="border-t border-border/50 px-3 py-2 flex items-center gap-1">
        <Skeleton className="h-7 w-7" />
        <Skeleton className="h-7 w-7" />
        <Skeleton className="h-7 w-7" />
      </div>
    </Card>
  );
}
