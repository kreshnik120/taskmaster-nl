import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { Phone, Mail, MapPin } from "lucide-react";
import { getOrganizationName } from "@/lib/organizationMapping";

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

export function ProfessionalCard({ 
  professional, 
  isSelected, 
  onSelect, 
  onClick 
}: ProfessionalCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "actief": return "bg-green-500";
      case "inactief": return "bg-gray-400";
      case "op_pauze": return "bg-orange-500";
      default: return "bg-gray-400";
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getFunctieAvatarColor = (functieNiveau: string) => {
    switch (functieNiveau) {
      case "VIG": return "bg-blue-600 text-white";
      case "HBO-V": return "bg-purple-600 text-white";
      case "Verpleegkundige MBO": return "bg-green-600 text-white";
      case "Helpende": return "bg-orange-500 text-white";
      case "Begeleider": return "bg-cyan-600 text-white";
      case "Persoonlijk begeleider": return "bg-pink-600 text-white";
      case "GGZ-agoog": return "bg-indigo-600 text-white";
      default: return "bg-gray-500 text-white";
    }
  };

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

  const getSectorColor = (sector: string) => {
    const colors: Record<string, string> = {
      "VVT": "bg-blue-500/10 text-blue-700 border-blue-200",
      "GGZ": "bg-purple-500/10 text-purple-700 border-purple-200",
      "GHZ": "bg-green-500/10 text-green-700 border-green-200",
      "Jeugdzorg": "bg-orange-500/10 text-orange-700 border-orange-200",
      "Ziekenhuis": "bg-red-500/10 text-red-700 border-red-200",
      "Thuiszorg": "bg-teal-500/10 text-teal-700 border-teal-200",
    };
    return colors[sector] || "bg-muted";
  };

  return (
    <HoverCard openDelay={300}>
      <HoverCardTrigger asChild>
        <Card 
          className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border-border bg-background overflow-hidden"
          onClick={onClick}
        >
          <div className="p-4">
            <div className="flex items-start gap-3">
              {/* Checkbox */}
              <div onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => onSelect(professional.id, checked as boolean)}
                />
              </div>

              {/* Avatar */}
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarFallback className={getFunctieAvatarColor(professional.functie_niveau)}>
                  {getInitials(professional.full_name)}
                </AvatarFallback>
              </Avatar>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Header: Name + Bureau + Status Dot */}
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-foreground truncate">
                    {professional.full_name}
                  </h3>
                  {professional.org_id && (
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] px-1.5 py-0 h-4 flex-shrink-0 ${
                        getOrganizationName(professional.org_id) === "ABCzorg" 
                          ? "border-blue-300 text-blue-600 bg-blue-50/50" 
                          : "border-green-300 text-green-600 bg-green-50/50"
                      }`}
                    >
                      {getOrganizationName(professional.org_id)}
                    </Badge>
                  )}
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(professional.status)} flex-shrink-0`} />
                </div>

                {/* Function · Work Type */}
                <p className="text-sm text-muted-foreground mb-2">
                  {professional.functie_niveau}
                  {professional.werkvorm && (
                    <>
                      <span className="mx-1.5">·</span>
                      {professional.werkvorm}
                    </>
                  )}
                </p>

                {/* Region */}
                {professional.regio && (
                  <p className="text-sm text-muted-foreground/80 mb-2">
                    {professional.regio}
                  </p>
                )}

                {/* Skills badges - max 2 + overflow */}
                {professional.skills && professional.skills.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {professional.skills.slice(0, 2).map((skill, idx) => (
                      <Badge 
                        key={idx} 
                        variant="outline" 
                        className={`text-xs ${getSectorColor(skill)}`}
                      >
                        {skill}
                      </Badge>
                    ))}
                    {professional.skills.length > 2 && (
                      <Badge variant="secondary" className="text-xs">
                        +{professional.skills.length - 2}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Time in Status - Subtle gray */}
                <p className="text-xs text-muted-foreground/60">
                  In deze status: {timeInStatus}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions Footer */}
          <div className="border-t border-border/50 bg-muted/30 px-4 py-2 flex gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handlePhoneClick}
                    disabled={!professional.telefoonnummer}
                    className="flex-1 h-8 text-xs"
                  >
                    <Phone className="h-3.5 w-3.5 mr-1.5" />
                    Bellen
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
                    className="flex-1 h-8 text-xs"
                  >
                    <Mail className="h-3.5 w-3.5 mr-1.5" />
                    E-mail
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
                    className="flex-1 h-8 text-xs"
                  >
                    <MapPin className="h-3.5 w-3.5 mr-1.5" />
                    Locatie
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {professional.regio || "Geen regio"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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

          {/* Skills/Sector badges in HoverCard */}
          {professional.skills && professional.skills.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-1.5">Sector Ervaring</div>
              <div className="flex gap-1.5 flex-wrap">
                {professional.skills.map((skill, idx) => (
                  <Badge 
                    key={idx} 
                    variant="outline" 
                    className={`text-xs ${getSectorColor(skill)}`}
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
