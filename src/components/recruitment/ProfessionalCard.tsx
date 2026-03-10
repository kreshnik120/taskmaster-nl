import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { Phone, Mail, MapPin, Clock, FileWarning, CheckCircle2, AlertCircle, FileX } from "lucide-react";
import { getOrganizationBadgeColor, getOrganizationName } from "@/lib/organizationMapping";
import { formatFunctieNiveau } from "@/lib/functieNiveau";
import { DirectPlacementButton } from "@/components/DirectPlacementButton";
import { AIMatchInsights } from "@/components/recruitment/AIMatchInsights";
import { cn } from "@/lib/utils";
import { getFunctieNiveauColor } from "@/types/organization";

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

const getInitials = (name: string): string => {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
};

const getFunctieColor = (functie?: string): string => getFunctieNiveauColor(functie).solid;

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

export function ProfessionalCard({ professional, isSelected, onSelect, onClick }: ProfessionalCardProps) {
  const timeLabel = formatDistanceToNow(new Date(professional.created_at), { addSuffix: true, locale: nl });

  const totalDocs = professional.documents_count || 0;
  const publishedDocs = professional.documents_published_count || 0;
  const expiringDocs = professional.documents_expiring_count || 0;
  const progressPercent = totalDocs > 0 ? Math.round((publishedDocs / totalDocs) * 100) : 0;

  const getDocIcon = () => {
    if (expiringDocs > 0) return <FileWarning className="h-3 w-3 text-destructive" />;
    if (totalDocs > 0 && publishedDocs >= totalDocs) return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
    if (totalDocs > 0) return <AlertCircle className="h-3 w-3 text-amber-500" />;
    return <FileX className="h-3 w-3 text-muted-foreground/40" />;
  };

  const getDocLabel = () => {
    if (expiringDocs > 0) return `${expiringDocs} verlopen`;
    if (totalDocs > 0 && publishedDocs >= totalDocs) return 'Docs OK';
    if (totalDocs > 0) return `${totalDocs - publishedDocs} onvolledig`;
    return 'Geen docs';
  };

  const getDocBarColor = () => {
    if (expiringDocs > 0) return 'bg-destructive';
    if (totalDocs > 0 && publishedDocs < totalDocs) return 'bg-amber-500';
    if (totalDocs > 0) return 'bg-emerald-500';
    return 'bg-muted-foreground/30';
  };

  return (
    <HoverCard openDelay={300}>
      <HoverCardTrigger asChild>
        <Card
          className={cn(
            "cursor-pointer glass-hover-lift bg-white/75 dark:bg-slate-900/75 border-white/40 dark:border-white/12",
            "shadow-[0_2px_6px_hsla(270,45%,55%,0.06),0_8px_24px_hsla(270,45%,55%,0.10)]",
            "focus:outline-none focus:ring-2 focus:ring-rose-500/30 rounded-xl overflow-hidden"
          )}
          onClick={onClick}
        >
          <div className="p-3.5">
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
              <div className="relative inline-flex flex-shrink-0">
                <Avatar className="h-10 w-10 ring-2 ring-white/50 dark:ring-white/10 shadow-sm">
                  <AvatarFallback className={cn(getFunctieColor(professional.functie_niveau), "text-white font-medium text-sm")}>
                    {getInitials(professional.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span
                  className={cn("absolute rounded-full ring-2 ring-background h-2.5 w-2.5 -bottom-0.5 -right-0.5", getStatusColor(professional.status))}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Name + Status + Org */}
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-semibold text-[14px] leading-tight text-foreground truncate">
                    {professional.full_name}
                  </h3>
                  <span className={cn("text-[10px] font-medium whitespace-nowrap", {
                    "text-green-600 dark:text-green-400": professional.status?.toLowerCase() === 'actief' || professional.status?.toLowerCase() === 'beschikbaar',
                    "text-amber-600 dark:text-amber-400": professional.status?.toLowerCase() === 'bezet' || professional.status?.toLowerCase() === 'in_behandeling',
                    "text-red-500 dark:text-red-400": professional.status?.toLowerCase() === 'inactief',
                    "text-orange-500 dark:text-orange-400": professional.status?.toLowerCase() === 'pauze' || professional.status?.toLowerCase() === 'op_pauze',
                    "text-muted-foreground/50": !['actief','beschikbaar','bezet','in_behandeling','inactief','pauze','op_pauze'].includes(professional.status?.toLowerCase() || ''),
                  })}>
                    {professional.status === 'op_pauze' ? 'Pauze' : professional.status?.charAt(0).toUpperCase() + professional.status?.slice(1)}
                  </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Name + Org */}
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-semibold text-[14px] leading-tight text-foreground truncate">
                    {professional.full_name}
                  </h3>
                  {professional.org_id && (
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] px-1.5 py-0 h-4 flex-shrink-0", getOrganizationBadgeColor(getOrganizationName(professional.org_id)))}
                    >
                      {getOrganizationName(professional.org_id)}
                    </Badge>
                  )}
                </div>

                {/* Function · Work Type · Region — single line */}
                <p className="text-[12px] text-muted-foreground/80 truncate mb-1">
                  {formatFunctieNiveau(professional.functie_niveau)}
                  {professional.werkvorm && <span className="text-muted-foreground/50"> · {professional.werkvorm}</span>}
                  {professional.regio && <span className="text-muted-foreground/50"> · {professional.regio}</span>}
                </p>

                {/* Skills (max 2) */}
                {professional.skills && professional.skills.length > 0 && (
                  <div className="flex gap-1 flex-wrap mb-1.5">
                    {professional.skills.slice(0, 2).map((skill, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[10px] font-normal h-5 px-1.5">
                        {skill}
                      </Badge>
                    ))}
                    {professional.skills.length > 2 && (
                      <Badge variant="ghost" className="text-[10px] font-normal h-5 px-1">
                        +{professional.skills.length - 2}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Compact footer: doc-status bar + timestamp in one row */}
                <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-border/20">
                  {/* Doc status */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    {getDocIcon()}
                    <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">{getDocLabel()}</span>
                    {totalDocs > 0 && (
                      <div className="h-1 w-12 bg-muted/30 rounded-full overflow-hidden flex-shrink-0">
                        <div className={cn("h-full rounded-full", getDocBarColor())} style={{ width: `${progressPercent}%` }} />
                      </div>
                    )}
                  </div>
                  {/* Spacer */}
                  <span className="flex-1" />
                  {/* Timestamp */}
                  <span className="text-[10px] text-muted-foreground/35 flex items-center gap-0.5 whitespace-nowrap">
                    <Clock className="h-2.5 w-2.5" />
                    {timeLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </HoverCardTrigger>

      {/* Hover Card — now includes contact actions */}
      <HoverCardContent className="w-80 glass-layer-2 glass-light-bleed rounded-xl">
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-foreground">{professional.full_name}</h4>
              {professional.org_id && (
                <Badge
                  variant="outline"
                  className={cn("text-[10px] px-1.5 py-0 h-4", getOrganizationBadgeColor(getOrganizationName(professional.org_id)))}
                >
                  {getOrganizationName(professional.org_id)}
                </Badge>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">{formatFunctieNiveau(professional.functie_niveau)}</Badge>
              {professional.werkvorm && <Badge variant="secondary" className="text-xs">{professional.werkvorm}</Badge>}
              <Badge variant={professional.status === "actief" ? "default" : "secondary"} className="text-xs">{professional.status}</Badge>
            </div>
          </div>

          {/* Contact actions — moved from card footer */}
          <div className="flex items-center gap-1.5">
            {professional.telefoonnummer && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 px-2" onClick={() => window.location.href = `tel:${professional.telefoonnummer}`}>
                <Phone className="h-3.5 w-3.5" /> {professional.telefoonnummer}
              </Button>
            )}
            {professional.email && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 px-2" onClick={() => window.location.href = `mailto:${professional.email}`}>
                <Mail className="h-3.5 w-3.5" /> E-mail
              </Button>
            )}
            {professional.regio && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 px-2" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(professional.regio!)}`, '_blank')}>
                <MapPin className="h-3.5 w-3.5" /> Kaart
              </Button>
            )}
          </div>

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
                  <Badge key={idx} variant="secondary" className="text-xs font-normal">{skill}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Direct Placement — moved from card footer */}
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
            className="w-full h-8 text-xs"
          />

          <AIMatchInsights functieNiveau={professional.functie_niveau} sector={professional.skills} />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
