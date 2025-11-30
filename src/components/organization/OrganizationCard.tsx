import { Building2, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { LocationCard } from "./LocationCard";

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
  sublocations?: Sublocation[];
}

interface Sublocation {
  id: string;
  naam: string;
  plaats: string | null;
  doelgroep: string[] | null;
  sector: string[] | null;
  gekoppelde_bv_org_id: string | null;
  hourly_rates_count?: number;
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

  return (
    <div className="space-y-2">
      <Card
        className="p-4 hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-primary/60"
        onClick={handleCardClick}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="mt-1">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
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
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>
                  {locationsCount} {locationsCount === 1 ? "hoofdlocatie" : "hoofdlocaties"}
                </span>
                <span>·</span>
                <span>
                  {sublocationsCount} {sublocationsCount === 1 ? "sublocatie" : "sublocaties"}
                </span>
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
