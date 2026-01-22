import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { Phone, Mail, MapPin } from "lucide-react";
import { getOrganizationName } from "@/lib/organizationMapping";
import { DirectPlacementButton } from "@/components/DirectPlacementButton";
import { AIMatchInsights } from "@/components/recruitment/AIMatchInsights";
import { cn } from "@/lib/utils";

interface Professional {
  id: string;
  full_name: string;
  functie_niveau: string;
  werkvorm: string | null;
  regio: string | null;
  status: string;
  created_at: string;
  telefoonnummer?: string | null;
  email?: string | null;
  skills?: string[];
  org_id?: string | null;
}

interface ProfessionalCardProps {
  professional: Professional;
  isSelected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onClick: () => void;
}

// Helper functions
const getInitials = (name: string): string => {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

const getFunctieColor = (functie?: string): string => {
  const colors: Record<string, string> = {
    'HBO-V': 'bg-blue-500',
    'VIG': 'bg-green-500',
    'Verpleegkundige MBO': 'bg-cyan-500',
    'Helpende': 'bg-amber-500',
    'Begeleider': 'bg-purple-500',
    'Persoonlijk begeleider': 'bg-indigo-500',
    'GGZ-agoog': 'bg-rose-500',
  };
  return colors[functie || ''] || 'bg-muted-foreground';
};

const getStatusColor = (status: string): string => {
  switch (status?.toLowerCase()) {
    case 'beschikbaar':
    case 'actief':
      return 'bg-green-500';
    case 'bezet':
    case 'in_behandeling':
      return 'bg-amber-500';
    case 'geplaatst':
      return 'bg-primary';
    default:
      return 'bg-muted-foreground/40';
  }
};

export function ProfessionalCard({ 
  professional, 
  isSelected, 
  onSelect, 
  onClick 
}: ProfessionalCardProps) {
  const timeInStatus = formatDistanceToNow(new Date(professional.created_at), { 
    addSuffix: false, 
    locale: nl 
  });

  const handlePhoneClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (professional.telefoonnummer) {
      window.location.href = `tel:${professional.telefoonnummer}`;
    }
  };

  const handleEmailClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (professional.email) {
      window.location.href = `mailto:${professional.email}`;
    }
  };

  const handleLocationClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (professional.regio) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(professional.regio)}`, '_blank');
    }
  };

  return (
    <HoverCard openDelay={300}>
      <HoverCardTrigger asChild>
        <Card 
          className={cn(
            "cursor-pointer border-border bg-background overflow-hidden",
            "transition-shadow duration-150",
            "hover:shadow-sm"
          )}
          onClick={onClick}
        >
          <div className="p-4">
            <div className="flex items-start gap-3">
              {/* Checkbox */}
              <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => onSelect(professional.id, checked as boolean)}
                  className="data-[state=checked]:bg-primary"
                />
              </div>

              {/* Avatar */}
              <div className="relative inline-flex">
                <Avatar className="h-10 w-10 ring-2 ring-background">
                  <AvatarFallback className={cn(
                    getFunctieColor(professional.functie_niveau),
                    "text-white font-medium text-sm"
                  )}>
                    {getInitials(professional.full_name)}
                  </AvatarFallback>
                </Avatar>
                {/* Status dot */}
                <span 
                  className={cn(
                    "absolute rounded-full ring-2 ring-background",
                    "h-2.5 w-2.5 -bottom-0.5 -right-0.5",
                    getStatusColor(professional.status)
                  )}
                  title={professional.status}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Header: Name + Bureau */}
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-medium text-foreground truncate">
                    {professional.full_name}
                  </h3>
                  {professional.org_id && (
                    <Badge 
                      variant="ghost"
                      className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0"
                    >
                      {getOrganizationName(professional.org_id)}
                    </Badge>
                  )}
                </div>

                {/* Function · Work Type */}
                <p className="text-sm text-muted-foreground mb-1.5">
                  {professional.functie_niveau}
                  {professional.werkvorm && (
                    <span className="text-muted-foreground/60"> · {professional.werkvorm}</span>
                  )}
                </p>

                {/* Region */}
                {professional.regio && (
                  <p className="text-sm text-muted-foreground/70 mb-2">
                    {professional.regio}
                  </p>
                )}

                {/* Skills badges */}
                {professional.skills && professional.skills.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {professional.skills.slice(0, 2).map((skill, idx) => (
                      <Badge 
                        key={idx} 
                        variant="secondary"
                        className="text-xs font-normal"
                      >
                        {skill}
                      </Badge>
                    ))}
                    {professional.skills.length > 2 && (
                      <Badge variant="ghost" className="text-xs font-normal">
                        +{professional.skills.length - 2}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Time in Status */}
                <p className="text-xs text-muted-foreground/50">
                  {timeInStatus}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions Footer */}
          <div className="bg-muted/20 px-4 py-2 flex gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handlePhoneClick}
                    disabled={!professional.telefoonnummer}
                    className="h-8 text-xs px-2"
                  >
                    <Phone className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {professional.telefoonnummer || "Geen telefoonnummer"}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleEmailClick}
                    disabled={!professional.email}
                    className="h-8 text-xs px-2"
                  >
                    <Mail className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {professional.email || "Geen e-mailadres"}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleLocationClick}
                    disabled={!professional.regio}
                    className="h-8 text-xs px-2"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {professional.regio || "Geen regio"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Direct Placement Button */}
            <DirectPlacementButton
              professionalId={professional.id}
              professionalName={professional.full_name}
              professionalData={{
                functie_niveau: professional.functie_niveau,
                werkvorm: professional.werkvorm || undefined,
                regio: professional.regio || undefined,
              }}
              variant="outline"
              size="sm"
              className="ml-auto h-8 text-xs"
            />
          </div>
        </Card>
      </HoverCardTrigger>

      <HoverCardContent className="w-80">
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-foreground">{professional.full_name}</h4>
              {professional.org_id && (
                <Badge 
                  variant="outline" 
                  className={`text-[10px] px-1.5 py-0 h-4 ${
                    getOrganizationName(professional.org_id) === "ABCzorg" 
                      ? "border-blue-300 text-blue-600 bg-blue-50/50" 
                      : "border-green-300 text-green-600 bg-green-50/50"
                  }`}
                >
                  {getOrganizationName(professional.org_id)}
                </Badge>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {professional.functie_niveau}
              </Badge>
              {professional.werkvorm && (
                <Badge variant="secondary" className="text-xs">
                  {professional.werkvorm}
                </Badge>
              )}
              <Badge 
                variant={professional.status === "actief" ? "default" : "secondary"}
                className="text-xs"
              >
                {professional.status}
              </Badge>
            </div>
          </div>

          {(professional.telefoonnummer || professional.email) && (
            <div className="space-y-1 text-sm">
              {professional.telefoonnummer && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{professional.telefoonnummer}</span>
                </div>
              )}
              {professional.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  <span>{professional.email}</span>
                </div>
              )}
            </div>
          )}

          {professional.regio && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Regio:</span> {professional.regio}
            </div>
          )}

          {professional.skills && professional.skills.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-1.5">Sector Ervaring</div>
              <div className="flex gap-1.5 flex-wrap">
                {professional.skills.map((skill, idx) => (
                  <Badge 
                    key={idx} 
                    variant="secondary"
                    className="text-xs font-normal"
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* AI Match Insights */}
          <AIMatchInsights 
            functieNiveau={professional.functie_niveau}
            sector={professional.skills}
          />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
