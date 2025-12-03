import { Building2, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { LocationCard } from "./LocationCard";
import { getOrganizationName, getOrganizationBadgeColor } from "@/lib/organizationMapping";

interface Organization {
  id: string;
  name: string;
  kvk_nummer: string | null;
  logo_url: string | null;
  locations?: Location[];
}

interface Location {
  id: string;
  naam: string;
  plaats: string | null;
  provincie: string | null;
  telefoon: string | null;
  contactpersoon_naam: string | null;
  adres: string | null;
  sublocations?: Sublocation[];
}

interface Sublocation {
  id: string;
  naam: string;
  plaats: string | null;
  provincie?: string | null;
  doelgroep: string[] | null;
  doelgroep_omschrijving?: string | null;
  sector: string[] | null;
  gezochte_functies?: string[] | null;
  gekoppelde_bv_org_id: string | null;
  telefoon?: string | null;
  adres?: string | null;
  capaciteit_min?: number | null;
  capaciteit_max?: number | null;
  leeftijd_van?: number | null;
  leeftijd_tot?: number | null;
  publieke_opmerking?: string | null;
}

interface OrganizationCardProps {
  organization: Organization;
  onOrganizationClick?: (org: Organization) => void;
  onLocationClick?: (location: Location) => void;
  onSublocationClick?: (sublocation: Sublocation) => void;
}

export function OrganizationCard({
  organization,
  onOrganizationClick,
  onLocationClick,
  onSublocationClick,
}: OrganizationCardProps) {
  const [isExpanded, setIsExpanded] = useState(() => {
    const stored = localStorage.getItem(`org-expanded-${organization.id}`);
    return stored === "true";
  });

  const toggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !isExpanded;
    setIsExpanded(newState);
    localStorage.setItem(`org-expanded-${organization.id}`, String(newState));
  };

  const handleCardClick = () => {
    if (onOrganizationClick) {
      onOrganizationClick(organization);
    }
  };

  const locationsCount = organization.locations?.length || 0;
  const sublocationsCount = organization.locations?.reduce(
    (sum, loc) => sum + (loc.sublocations?.length || 0),
    0
  ) || 0;

  // Aggregeer sector badges van alle sublocaties
  const allSectors = Array.from(
    new Set(
      organization.locations?.flatMap(loc => 
        loc.sublocations?.flatMap(sub => sub.sector || []) || []
      ) || []
    )
  ).slice(0, 3); // Toon maximaal 3 sectoren

  // Count per bureau
  const abczorgCount = organization.locations?.reduce((sum, loc) => 
    sum + (loc.sublocations?.filter(sub => getOrganizationName(sub.gekoppelde_bv_org_id) === "ABCzorg")?.length || 0), 0) || 0;
  const citozorgCount = organization.locations?.reduce((sum, loc) => 
    sum + (loc.sublocations?.filter(sub => getOrganizationName(sub.gekoppelde_bv_org_id) === "CitoZorg")?.length || 0), 0) || 0;

  return (
    <div className="space-y-2">
      <Card
        className="p-4 hover:shadow-lg hover:bg-accent/5 transition-all duration-200 cursor-pointer border-l-4 border-l-primary/60"
        onClick={handleCardClick}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            {organization.logo_url ? (
              <img
                src={organization.logo_url}
                alt={organization.name}
                className="h-10 w-10 rounded-lg object-cover mt-0.5"
              />
            ) : (
              <div className="mt-1">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg truncate">
                  {organization.name}
                </h3>
                {organization.kvk_nummer && (
                  <Badge variant="outline" className="shrink-0">
                    KVK: {organization.kvk_nummer}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
                <span>
                  {locationsCount} {locationsCount === 1 ? "hoofdlocatie" : "hoofdlocaties"}
                </span>
                <span>·</span>
                <span>
                  {sublocationsCount} {sublocationsCount === 1 ? "sublocatie" : "sublocaties"}
                </span>
              </div>
              {/* Bureau counts en sector badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {abczorgCount > 0 && (
                  <Badge variant="outline" className={getOrganizationBadgeColor("ABCzorg")}>
                    ABCzorg {abczorgCount}
                  </Badge>
                )}
                {citozorgCount > 0 && (
                  <Badge variant="outline" className={getOrganizationBadgeColor("CitoZorg")}>
                    CitoZorg {citozorgCount}
                  </Badge>
                )}
                {allSectors.map((sector) => (
                  <Badge key={sector} variant="outline" className="text-xs">
                    {sector}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={toggleExpanded}
            className="shrink-0 p-1 hover:bg-accent rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )}
          </button>
        </div>
      </Card>

      {isExpanded && organization.locations && organization.locations.length > 0 && (
        <div className="ml-8 space-y-2">
          {organization.locations.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              organizationName={organization.name}
              onLocationClick={onLocationClick}
              onSublocationClick={onSublocationClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
