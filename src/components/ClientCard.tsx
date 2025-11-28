import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Building2, Phone, Mail, MapPin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

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
  onClick: () => void;
  onQuickCall?: () => void;
  onQuickEmail?: () => void;
  groupType?: "bureau" | "matching" | "regio" | "alpha";
}

export function ClientCard({ client, searchQuery = "", onClick, onQuickCall, onQuickEmail, groupType }: ClientCardProps) {
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

  // Color hash for consistent avatar colors
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

  return (
    <HoverCard openDelay={300}>
      <HoverCardTrigger asChild>
        <Card 
          className="group cursor-pointer transition-all duration-200 hover:bg-muted/30 relative"
          onClick={onClick}
        >
          <CardContent className="p-3">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarFallback className={getAvatarColor(client.company)}>
                  {getInitials(client.company)}
                </AvatarFallback>
              </Avatar>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Header with name and status dot */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-sm truncate">
                    {highlightText(client.name, searchQuery)}
                  </h3>
                  <div className="flex items-center gap-2">
                    {groupType !== "matching" && (
                      <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                        hasCompleteMatchingData ? 'bg-green-500' : 
                        hasPartialMatchingData ? 'bg-amber-500' : 'bg-muted'
                      }`} />
                    )}
                    {groupType !== "bureau" && client.organizations?.name && (
                      <Badge 
                        variant="secondary" 
                        className={`text-xs ${client.organizations.name === 'ABCzorg' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'}`}
                      >
                        {client.organizations.name}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Metadata line - single line with bullets */}
                {(client.regio?.length || client.sector?.length) && (
                  <div className="text-xs text-muted-foreground">
                    {[
                      client.regio && client.regio.length > 0 ? client.regio[0] : null,
                      client.sector && client.sector.length > 0 ? client.sector[0] : null
                    ].filter(Boolean).join(' • ')}
                  </div>
                )}
              </div>
            </div>

            {/* Hover Actions */}
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {client.phone && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickCall?.();
                  }}
                >
                  <Phone className="h-3 w-3" />
                </Button>
              )}
              {client.email && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickEmail?.();
                  }}
                >
                  <Mail className="h-3 w-3" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-16" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}
