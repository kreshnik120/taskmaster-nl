import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Phone, Mail, Globe, Building2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

interface Location {
  id: string;
  naam: string;
  plaats?: string | null;
  telefoon?: string | null;
  contactpersoon_email?: string | null;
  sublocations?: Sublocation[];
}

interface Sublocation {
  id: string;
  naam: string;
  sector?: string[] | null;
  doelgroep?: string[] | null;
  gezochte_functies?: string[] | null;
  plaats?: string | null;
  publieke_opmerking?: string | null;
}

interface Organization {
  id: string;
  name: string;
  org_id: string;
  kvk_nummer?: string | null;
  logo_url?: string | null;
  website?: string | null;
  centrale_facturatie_email?: string | null;
  locations?: Location[];
  bureau?: string; // ABCzorg or CitoZorg
}

interface OrganizationCardSimpleProps {
  organization: Organization;
  searchQuery?: string;
  onClick: (org: Organization) => void;
  groupType?: "bureau" | "sector" | "matching" | "regio" | "alpha";
  index?: number;
}

export function OrganizationCardSimple({ 
  organization, 
  searchQuery = "", 
  onClick, 
  groupType, 
  index = 0 
}: OrganizationCardSimpleProps) {
  // Count locations and sublocations
  const locationCount = organization.locations?.length || 0;
  const sublocationCount = organization.locations?.reduce(
    (acc, loc) => acc + (loc.sublocations?.length || 0), 0
  ) || 0;

  // Get aggregated sectors from sublocations
  const allSectors = new Set<string>();
  organization.locations?.forEach(loc => {
    loc.sublocations?.forEach(sub => {
      sub.sector?.forEach(s => allSectors.add(s));
    });
  });

  // Get primary contact info from first location
  const primaryLocation = organization.locations?.[0];
  const primaryPhone = primaryLocation?.telefoon;
  const primaryEmail = primaryLocation?.contactpersoon_email || organization.centrale_facturatie_email;

  // Get primary region from sublocations
  const primaryRegion = organization.locations?.find(l => l.plaats)?.plaats ||
    organization.locations?.flatMap(l => l.sublocations || []).find(s => s.plaats)?.plaats;

  // Avatar initials
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .filter(word => !['Stichting', 'de', 'het', 'van'].includes(word))
      .slice(0, 2)
      .map(word => word[0])
      .join("")
      .toUpperCase();
  };

  // Avatar color based on primary sector
  const getSectorAvatarColor = () => {
    const primarySector = Array.from(allSectors)[0];
    if (primarySector) {
      switch (primarySector) {
        case "GGZ": return "bg-blue-600";
        case "GHZ": return "bg-emerald-600";
        case "Jeugdzorg": return "bg-orange-500";
        case "VVT": return "bg-purple-600";
        case "Ziekenhuis": return "bg-red-500";
        case "Thuiszorg": return "bg-cyan-600";
        default: return "bg-slate-500";
      }
    }
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

  // Data completeness calculation
  const hasSublocations = sublocationCount > 0;
  const hasSectors = allSectors.size > 0;
  const hasPhone = !!primaryPhone;
  const hasEmail = !!primaryEmail;
  
  // Calculate completeness score
  const completenessScore = [hasSublocations, hasSectors, hasPhone, hasEmail].filter(Boolean).length;
  const isIncomplete = completenessScore < 3;
  
  // Get missing items for tooltip
  const missingItems: string[] = [];
  if (!hasSublocations) missingItems.push("werklocaties");
  if (!hasSectors) missingItems.push("sector");
  if (!hasPhone) missingItems.push("telefoon");
  if (!hasEmail) missingItems.push("email");

  const handleQuickCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (primaryPhone) {
      window.location.href = `tel:${primaryPhone}`;
    }
  };

  const handleQuickEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (primaryEmail) {
      window.location.href = `mailto:${primaryEmail}`;
    }
  };

  const handleQuickWebsite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (organization.website) {
      window.open(organization.website, '_blank');
    }
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
          // Premium micro-interactions
          whileHover={{ 
            y: -2,
            transition: { type: "spring", stiffness: 400, damping: 25 }
          }}
          whileTap={{ 
            scale: 0.995,
            transition: { duration: 0.1 }
          }}
        >
          <Card 
            className={`cursor-pointer glass-hover-lift bg-white/75 dark:bg-slate-900/75 border-white/40 dark:border-white/12 shadow-[0_2px_6px_hsla(215,25%,48%,0.06),0_8px_24px_hsla(215,25%,48%,0.10)] focus:outline-none focus:ring-2 focus:ring-slate-500/30 rounded-xl ${isIncomplete ? 'opacity-80' : 'opacity-100'} flex flex-col overflow-hidden`}
            onClick={() => onClick(organization)}
          >
            {/* Main content */}
            <CardContent className="p-3 flex-1">
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarImage 
                    src={organization.logo_url || undefined} 
                    alt={organization.name} 
                    className="object-contain"
                  />
                  <AvatarFallback className={getSectorAvatarColor()}>
                    {getInitials(organization.name)}
                  </AvatarFallback>
                </Avatar>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Header with name and badges */}
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-sm truncate">
                      {highlightText(organization.name, searchQuery)}
                    </h3>
                    <div className="flex items-center gap-2">
                      {/* Sublocation count badge */}
                      {sublocationCount > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-xs gap-1">
                                <Building2 className="h-3 w-3" />
                                {sublocationCount}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {sublocationCount} werklocatie{sublocationCount !== 1 ? 's' : ''}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {/* Data completeness indicator */}
                      {isIncomplete && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                                <AlertCircle className="h-3 w-3" />
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-medium">Data incompleet</p>
                              <p className="text-xs text-muted-foreground">
                                Ontbreekt: {missingItems.join(", ")}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {/* Bureau badge */}
                      {organization.bureau && (
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${organization.bureau === 'ABCzorg' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}
                        >
                          {organization.bureau}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Metadata line */}
                  <div className="text-xs text-muted-foreground">
                    {primaryRegion && allSectors.size > 0 ? (
                      [primaryRegion, Array.from(allSectors)[0]].join(' • ')
                    ) : primaryRegion ? (
                      primaryRegion
                    ) : allSectors.size > 0 ? (
                      Array.from(allSectors).slice(0, 2).join(' • ')
                    ) : (
                      <span className="italic">Geen werklocaties</span>
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
                      disabled={!primaryPhone}
                      className="h-7 px-2 disabled:opacity-40 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_6px_hsla(215,25%,48%,0.08)] hover:bg-white/80 dark:hover:bg-slate-800/80 hover:shadow-[0_4px_10px_hsla(215,25%,48%,0.12)] transition-all duration-200"
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {primaryPhone ? `Bel: ${primaryPhone}` : "Geen telefoonnummer"}
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
                      disabled={!primaryEmail}
                      className="h-7 px-2 disabled:opacity-40 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_6px_hsla(215,25%,48%,0.08)] hover:bg-white/80 dark:hover:bg-slate-800/80 hover:shadow-[0_4px_10px_hsla(215,25%,48%,0.12)] transition-all duration-200"
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {primaryEmail ? "Email organisatie" : "Geen email adres"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleQuickWebsite}
                      disabled={!organization.website}
                      className="h-7 px-2 disabled:opacity-40 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_6px_hsla(215,25%,48%,0.08)] hover:bg-white/80 dark:hover:bg-slate-800/80 hover:shadow-[0_4px_10px_hsla(215,25%,48%,0.12)] transition-all duration-200"
                    >
                      <Globe className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {organization.website ? "Bekijk website" : "Geen website"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </Card>
        </motion.div>
      </HoverCardTrigger>
      
      <HoverCardContent className="w-80 glass-layer-2 glass-light-bleed rounded-xl" side="top">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold mb-1">{organization.name}</h4>
            {organization.kvk_nummer && (
              <p className="text-xs text-muted-foreground">KVK: {organization.kvk_nummer}</p>
            )}
          </div>
          
          {/* Locations summary */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Structuur</p>
            <div className="flex gap-4 text-sm">
              <span>{locationCount} locatie{locationCount !== 1 ? 's' : ''}</span>
              <span>{sublocationCount} werklocatie{sublocationCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
          
          {/* Sectors */}
          {allSectors.size > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground">Sectoren</p>
              <div className="flex flex-wrap gap-1">
                {Array.from(allSectors).slice(0, 4).map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs">
                    {s}
                  </Badge>
                ))}
                {allSectors.size > 4 && (
                  <Badge variant="outline" className="text-xs">
                    +{allSectors.size - 4}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Contact */}
          {(primaryPhone || primaryEmail) && (
            <div className="space-y-1 text-sm pt-2 border-t">
              {primaryPhone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  {primaryPhone}
                </div>
              )}
              {primaryEmail && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{primaryEmail}</span>
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
export function OrganizationCardSimpleSkeleton() {
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
