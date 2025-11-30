import { MapPin, ChevronDown, ChevronRight, Building, Euro, Phone, Copy, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { SublocationCard } from "./SublocationCard";
import { useToast } from "@/hooks/use-toast";

interface Sublocation {
  id: string;
  naam: string;
  plaats: string | null;
  doelgroep: string[] | null;
  sector: string[] | null;
  gekoppelde_bv_org_id: string | null;
  hourly_rates_count?: number;
  tarieven_min?: number;
  tarieven_max?: number;
  telefoon?: string | null;
  adres?: string | null;
  capaciteit_min?: number | null;
  capaciteit_max?: number | null;
}

interface Location {
  id: string;
  naam: string;
  plaats: string | null;
  provincie: string | null;
  telefoon: string | null;
  contactpersoon_naam: string | null;
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
  const { toast } = useToast();
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

  const handleCopyPhone = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (location.telefoon) {
      navigator.clipboard.writeText(location.telefoon);
      toast({
        title: "Telefoonnummer gekopieerd",
        description: location.telefoon,
      });
    }
  };

  const handleQuickCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (location.telefoon) {
      window.location.href = `tel:${location.telefoon}`;
    }
  };

  const sublocationsCount = location.sublocations?.length || 0;

  // Aggregeer sector badges van sublocaties
  const allSectors = Array.from(
    new Set(
      location.sublocations?.flatMap(sub => sub.sector || []) || []
    )
  ).slice(0, 3);

  // Totaal aantal tarieven
  const totalRates = location.sublocations?.reduce((sum, sub) => sum + (sub.hourly_rates_count || 0), 0) || 0;

  return (
    <div className="space-y-2">
      <Card
        className="p-3 hover:shadow-lg hover:bg-accent/5 transition-all duration-200 cursor-pointer border-l-4 border-l-blue-400/60"
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
                {location.contactpersoon_naam && (
                  <>
                    <span>·</span>
                    <User className="h-3 w-3 inline" />
                    <span className="truncate">{location.contactpersoon_naam}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <span>
                  {sublocationsCount} {sublocationsCount === 1 ? "sublocatie" : "sublocaties"}
                </span>
                {allSectors.length > 0 && (
                  <>
                    <span>·</span>
                    {allSectors.map((sector) => (
                      <Badge key={sector} variant="outline" className="text-xs">
                        {sector}
                      </Badge>
                    ))}
                  </>
                )}
                {totalRates > 0 && (
                  <>
                    <span>·</span>
                    <Badge className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
                      <Euro className="h-3 w-3 mr-1" />
                      {totalRates} {totalRates === 1 ? "tarief" : "tarieven"}
                    </Badge>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {location.telefoon && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={handleCopyPhone}
                  title="Kopieer telefoonnummer"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={handleQuickCall}
                  title="Bel direct"
                >
                  <Phone className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
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
