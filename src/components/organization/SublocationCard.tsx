import { Building, Euro, Phone, Mail, MapPin as MapPinIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOrganizationName, getOrganizationBadgeColor } from "@/lib/organizationMapping";

interface Sublocation {
  id: string;
  naam: string;
  plaats: string | null;
  doelgroep: string[] | null;
  sector: string[] | null;
  gekoppelde_bv_org_id: string | null;
  hourly_rates_count?: number;
  telefoon?: string | null;
  adres?: string | null;
}

interface SublocationCardProps {
  sublocation: Sublocation;
  organizationName: string;
  locationName: string;
  onSublocationClick?: (sublocation: Sublocation) => void;
}

export function SublocationCard({
  sublocation,
  organizationName,
  locationName,
  onSublocationClick,
}: SublocationCardProps) {
  const handleCardClick = () => {
    if (onSublocationClick) {
      onSublocationClick(sublocation);
    }
  };

  const handleQuickCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (sublocation.telefoon) {
      window.location.href = `tel:${sublocation.telefoon}`;
    }
  };

  const handleQuickRoute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (sublocation.adres && sublocation.plaats) {
      const address = `${sublocation.adres}, ${sublocation.plaats}`;
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
    }
  };

  const bemiddelaar = getOrganizationName(sublocation.gekoppelde_bv_org_id);
  const bemiddelaarColor = getOrganizationBadgeColor(bemiddelaar);

  return (
    <Card
      className="p-3 hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-green-400/60"
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="mt-0.5">
            <Building className="h-4 w-4 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h5 className="font-medium text-sm truncate">{sublocation.naam}</h5>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
              {sublocation.plaats && (
                <span className="truncate">{sublocation.plaats}</span>
              )}
              {bemiddelaar && (
                <>
                  <span>·</span>
                  <Badge variant="outline" className={`text-xs ${bemiddelaarColor}`}>
                    {bemiddelaar}
                  </Badge>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {sublocation.doelgroep && sublocation.doelgroep.length > 0 && (
                <div className="flex items-center gap-1">
                  {sublocation.doelgroep.slice(0, 2).map((dg) => (
                    <Badge key={dg} variant="secondary" className="text-xs">
                      {dg}
                    </Badge>
                  ))}
                  {sublocation.doelgroep.length > 2 && (
                    <Badge variant="secondary" className="text-xs">
                      +{sublocation.doelgroep.length - 2}
                    </Badge>
                  )}
                </div>
              )}
              {sublocation.hourly_rates_count !== undefined && sublocation.hourly_rates_count > 0 && (
                <Badge variant="outline" className="text-xs">
                  <Euro className="h-3 w-3 mr-1" />
                  {sublocation.hourly_rates_count} {sublocation.hourly_rates_count === 1 ? "tarief" : "tarieven"}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {sublocation.telefoon && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={handleQuickCall}
              title="Bel direct"
            >
              <Phone className="h-3.5 w-3.5" />
            </Button>
          )}
          {sublocation.adres && sublocation.plaats && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={handleQuickRoute}
              title="Bekijk route"
            >
              <MapPinIcon className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
