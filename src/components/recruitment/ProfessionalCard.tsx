import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { Phone, Mail, MapPin, Clock, FileWarning, CheckCircle2, AlertCircle, FileX } from "lucide-react";
import { getOrganizationBadgeColor } from "@/lib/organizationMapping";
import { getOrganizationName } from "@/lib/organizationMapping";
import { formatFunctieNiveau } from "@/lib/functieNiveau";
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
  documents_count?: number | null;
  documents_published_count?: number | null;
  documents_expiring_count?: number | null;
  documents_synced_at?: string | null;
  bendy_groepen?: string[] | null;
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
    case 'inactief':
      return 'bg-red-400';
    case 'pauze':
    case 'op_pauze':
      return 'bg-orange-400';
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
  const timeLabel = professional.documents_synced_at
    ? `Docs gesyncet ${formatDistanceToNow(new Date(professional.documents_synced_at), { addSuffix: true, locale: nl })}`
    : `Geregistreerd ${formatDistanceToNow(new Date(professional.created_at), { addSuffix: true, locale: nl })}`;

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
            "cursor-pointer glass-hover-lift bg-white/75 dark:bg-slate-900/75 border-white/40 dark:border-white/12",
            "shadow-[0_2px_6px_hsla(270,45%,55%,0.06),0_8px_24px_hsla(270,45%,55%,0.10)]",
            "focus:outline-none focus:ring-2 focus:ring-violet-500/30 rounded-xl overflow-hidden"
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
                  className="data-[state=checked]:bg-primary opacity-60 hover:opacity-100 transition-opacity"
                />
              </div>

              {/* Avatar */}
              <div className="relative inline-flex">
                <Avatar className="h-11 w-11 ring-2 ring-white/50 dark:ring-white/10 shadow-sm">
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
                  <h3 className="font-semibold text-[15px] text-foreground truncate">
                    {professional.full_name}
                  </h3>
                  {professional.org_id && (
                    <Badge 
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 py-0 h-4 flex-shrink-0",
                        getOrganizationBadgeColor(getOrganizationName(professional.org_id))
                      )}
                    >
                      {getOrganizationName(professional.org_id)}
                    </Badge>
                  )}
                </div>

                {/* Function · Work Type */}
                <p className="text-[13px] text-muted-foreground/80 mb-1.5">
                  {formatFunctieNiveau(professional.functie_niveau)}
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

                {/* Bendy groepen */}
                {professional.bendy_groepen && professional.bendy_groepen.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {professional.bendy_groepen.slice(0, 2).map((groep, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="text-xs font-normal bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800"
                      >
                        {groep}
                      </Badge>
                    ))}
                    {professional.bendy_groepen.length > 2 && (
                      <Badge variant="ghost" className="text-xs font-normal">
                        +{professional.bendy_groepen.length - 2}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Document badge + timestamp footer group */}
                <div className="mt-auto pt-2 border-t border-border/30 space-y-1">
                  {/* Document compliance badge */}
                  {professional.documents_expiring_count && professional.documents_expiring_count > 0 ? (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-medium backdrop-blur-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] bg-red-500/[0.08] text-red-600 dark:text-red-400 border-red-200/40 dark:border-red-800/40">
                      <FileWarning className="h-3 w-3" />
                      {professional.documents_expiring_count} doc{professional.documents_expiring_count !== 1 ? 's' : ''} verlopen
                    </Badge>
                  ) : professional.documents_published_count && professional.documents_published_count > 0 ? (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-medium backdrop-blur-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] bg-emerald-500/[0.08] text-emerald-600 dark:text-emerald-400 border-emerald-200/40 dark:border-emerald-800/40">
                      <CheckCircle2 className="h-3 w-3" />
                      Docs OK ({professional.documents_published_count})
                    </Badge>
                  ) : professional.documents_count && professional.documents_count > 0 ? (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-medium backdrop-blur-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] bg-amber-500/[0.08] text-amber-600 dark:text-amber-400 border-amber-200/40 dark:border-amber-800/40">
                      <AlertCircle className="h-3 w-3" />
                      {professional.documents_count} docs niet gepubliceerd
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-medium backdrop-blur-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] bg-muted/50 text-muted-foreground/60 border-border/30">
                      <FileX className="h-3 w-3" />
                      Geen docs
                    </Badge>
                  )}

                  {/* Timestamp */}
                  <p className="text-[11px] text-muted-foreground/40 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {timeLabel}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions Footer */}
          <div className="bg-gradient-to-t from-muted/30 to-transparent border-t border-border/20 px-4 py-2 flex gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handlePhoneClick}
                    disabled={!professional.telefoonnummer}
                    className="h-8 text-xs px-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_6px_hsla(270,45%,55%,0.08)] hover:bg-white/80 dark:hover:bg-slate-800/80 hover:shadow-[0_4px_10px_hsla(270,45%,55%,0.12)] transition-all duration-200 disabled:opacity-30"
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
                    className="h-8 text-xs px-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_6px_hsla(270,45%,55%,0.08)] hover:bg-white/80 dark:hover:bg-slate-800/80 hover:shadow-[0_4px_10px_hsla(270,45%,55%,0.12)] transition-all duration-200 disabled:opacity-30"
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
                    className="h-8 text-xs px-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_6px_hsla(270,45%,55%,0.08)] hover:bg-white/80 dark:hover:bg-slate-800/80 hover:shadow-[0_4px_10px_hsla(270,45%,55%,0.12)] transition-all duration-200 disabled:opacity-30"
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
              className="ml-auto h-8 text-xs hover:bg-primary/5 hover:border-primary/30"
            />
          </div>
        </Card>
      </HoverCardTrigger>

      <HoverCardContent className="w-80 glass-layer-2 glass-light-bleed rounded-xl">
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
                {formatFunctieNiveau(professional.functie_niveau)}
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
