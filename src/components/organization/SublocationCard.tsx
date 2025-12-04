import { Building, Phone, MapPin as MapPinIcon, Users, Copy, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// Sector color mappings (consistent with ClientDetailModal)
const SECTOR_COLORS: Record<string, string> = {
  "VVT": "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  "GGZ": "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  "GHZ": "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  "Jeugdzorg": "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  "Ziekenhuis": "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  "Thuiszorg": "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20",
};

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
  const { toast } = useToast();
  
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

  const handleCopyPhone = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (sublocation.telefoon) {
      navigator.clipboard.writeText(sublocation.telefoon);
      toast({
        title: "Telefoonnummer gekopieerd",
        description: sublocation.telefoon,
      });
    }
  };

  // Bureau badge verwijderd - is al zichtbaar op organisatie niveau

  return (
    <Card
      className="p-3 hover:shadow-lg hover:bg-accent/5 transition-all duration-200 cursor-pointer border-l-4 border-l-green-400/60"
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
              {/* Capaciteit indicator */}
              {sublocation.capaciteit_min != null && sublocation.capaciteit_max != null && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {sublocation.capaciteit_min}-{sublocation.capaciteit_max}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {/* Werkbeschrijving indicator */}
              {sublocation.publieke_opmerking && (
                <Badge 
                  variant="outline" 
                  className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  Werkbeschrijving
                </Badge>
              )}
              {/* Sector badges */}
              {sublocation.sector && sublocation.sector.length > 0 && (
                <div className="flex items-center gap-1">
                  {sublocation.sector.map((sector) => (
                    <Badge 
                      key={sector} 
                      variant="outline" 
                      className={`text-xs ${SECTOR_COLORS[sector] || 'bg-muted'}`}
                    >
                      {sector}
                    </Badge>
                  ))}
                </div>
              )}
              {/* Doelgroep badges */}
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
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {sublocation.telefoon && (
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
