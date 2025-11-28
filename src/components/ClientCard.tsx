import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Building2, Phone, Mail, MapPin, CheckCircle2, Clock } from "lucide-react";
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
}

export function ClientCard({ client, searchQuery = "", onClick, onQuickCall, onQuickEmail }: ClientCardProps) {
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

  return (
    <HoverCard openDelay={300}>
      <HoverCardTrigger asChild>
        <Card 
          className="group cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.01] hover:border-primary/30"
          onClick={onClick}
        >
          <CardHeader>
            <CardTitle className="flex items-start gap-3">
              <Avatar className={`${getAvatarColor(client.company)} h-10 w-10 shrink-0`}>
                <AvatarFallback className="text-white font-semibold">
                  {getInitials(client.company)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold truncate">
                    {highlightText(client.name, searchQuery)}
                  </span>
                  {hasMatchingData && (
                    <div 
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        completenessScore === 4 ? "bg-green-600" : "bg-amber-600"
                      }`}
                      title={`${completenessScore}/4 matching criteria ingevuld`}
                    />
                  )}
                </div>
                <p className="text-sm text-muted-foreground font-normal truncate">
                  {highlightText(client.company, searchQuery)}
                </p>
                
                {/* Time indicator */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {getTimeIndicator(client.created_at)}
                </div>
              </div>
              
              <Badge 
                className={
                  client.organizations?.name === "ABCzorg" 
                    ? "bg-blue-600 hover:bg-blue-700 text-white shrink-0" 
                    : "bg-orange-500 hover:bg-orange-600 text-white shrink-0"
                }
              >
                {client.organizations?.name || "Onbekend"}
              </Badge>
            </CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-3">
            {/* Matching data preview */}
            {hasMatchingData && (
              <div className="flex flex-wrap gap-1">
                {client.regio?.slice(0, 2).map((r) => (
                  <Badge key={r} variant="secondary" className="text-xs">
                    {r}
                  </Badge>
                ))}
                {client.sector?.slice(0, 2).map((s) => (
                  <Badge key={s} variant="outline" className="text-xs">
                    {s}
                  </Badge>
                ))}
                {((client.regio?.length || 0) > 2 || (client.sector?.length || 0) > 2) && (
                  <Badge variant="secondary" className="text-xs">
                    +meer
                  </Badge>
                )}
              </div>
            )}
            
            {/* Quick stats */}
            <div className="text-xs text-muted-foreground">
              {client.regio?.length || 0} regio's • {client.sector?.length || 0} sectoren
            </div>
            
            {/* Hover-only quick actions */}
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {client.phone && onQuickCall && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 px-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickCall();
                  }}
                >
                  <Phone className="h-3 w-3" />
                </Button>
              )}
              {client.email && onQuickEmail && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 px-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickEmail();
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
