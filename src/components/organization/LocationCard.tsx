import { MapPin, ChevronDown, ChevronRight, Building } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useState } from "react";
import { SublocationCard } from "./SublocationCard";

interface Sublocation {
  id: string;
  naam: string;
  plaats: string | null;
  doelgroep: string[] | null;
  sector: string[] | null;
  gekoppelde_bv_org_id: string | null;
  hourly_rates_count?: number;
}

interface Location {
  id: string;
  naam: string;
  plaats: string | null;
  provincie: string | null;
  sublocations?: Sublocation[];
}

interface LocationCardProps {
  location: Location;
  organizationName: string;
  onLocationClick?: (location: Location) => void;
  onSublocationClick?: (sublocation: Sublocation) => void;
}

export function LocationCard({
  location,
  organizationName,
  onLocationClick,
  onSublocationClick,
}: LocationCardProps) {
  const [isExpanded, setIsExpanded] = useState(() => {
    const stored = localStorage.getItem(`loc-expanded-${location.id}`);
    return stored === "true";
  });

  const toggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !isExpanded;
    setIsExpanded(newState);
    localStorage.setItem(`loc-expanded-${location.id}`, String(newState));
  };

  const handleCardClick = () => {
    if (onLocationClick) {
      onLocationClick(location);
    }
  };

  const sublocationsCount = location.sublocations?.length || 0;

  return (
    <div className="space-y-2">
      <Card
        className="p-3 hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-blue-400/60"
        onClick={handleCardClick}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="mt-0.5">
              <MapPin className="h-4 w-4 text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium truncate">{location.naam}</h4>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                {location.plaats && (
                  <span className="truncate">{location.plaats}</span>
                )}
                {location.provincie && (
                  <>
                    <span>·</span>
                    <span>{location.provincie}</span>
                  </>
                )}
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
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </div>
      </Card>

      {isExpanded && location.sublocations && location.sublocations.length > 0 && (
        <div className="ml-8 space-y-2">
          {location.sublocations.map((sublocation) => (
            <SublocationCard
              key={sublocation.id}
              sublocation={sublocation}
              organizationName={organizationName}
              locationName={location.naam}
              onSublocationClick={onSublocationClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
