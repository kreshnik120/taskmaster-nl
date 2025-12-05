import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Building2, MapPin, Users, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { getActivePlacementSublocationIds } from "@/lib/checkExistingPlacement";

export interface Sublocation {
  id: string;
  naam: string;
  plaats: string | null;
  provincie?: string | null;
  postcode?: string | null;
  sector: string[] | null;
  doelgroep: string[] | null;
  gezochte_functies: string[] | null;
  publieke_opmerking: string | null;
  location: {
    id: string;
    naam: string;
    client_org: {
      id: string;
      name: string;
    } | null;
  } | null;
}

export interface ProfessionalData {
  functie_niveau?: string;
  werkvorm?: string;
  regio?: string;
  woonplaats?: string;
  postcode?: string;
  provincie?: string;
  beschikbaarheid?: string;
  ervaring_sector?: string[];
  doelgroep_ervaring?: string[];
  heeft_auto?: boolean;
  heeft_rijbewijs?: boolean;
  eigen_vervoer?: boolean;
  certificaten?: string[];
  specialisaties?: string[];
  jaren_ervaring?: number;
  leidinggevende_ervaring?: boolean;
  nachtdienst_bereid?: boolean;
  weekenddienst_bereid?: boolean;
}

interface SmartSublocationPickerProps {
  professionalId?: string;
  professionalData?: ProfessionalData; // Optional - not used for scoring, but passed through
  onSelect: (sublocationId: string, sublocationName: string, sublocationData?: Sublocation) => void;
  onCancel: () => void;
}

export interface ScoredSublocation extends Sublocation {
  isAlreadyPlaced?: boolean;
}

/**
 * Simpele zoek-en-selecteer dialog voor werklocaties.
 * AI matching scores zijn te vinden in ApplicationDetailModal → Matches tab.
 */
export function SmartSublocationPicker({ 
  professionalId,
  professionalData, // eslint-disable-line @typescript-eslint/no-unused-vars
  onSelect, 
  onCancel 
}: SmartSublocationPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [existingPlacementIds, setExistingPlacementIds] = useState<string[]>([]);

  // Fetch existing active placements for this professional
  useEffect(() => {
    if (professionalId) {
      getActivePlacementSublocationIds(professionalId).then(setExistingPlacementIds);
    }
  }, [professionalId]);

  const { data: sublocations, isLoading } = useQuery({
    queryKey: ['sublocations-for-smart-placement'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('client_sublocations')
        .select(`
          id,
          naam,
          plaats,
          provincie,
          postcode,
          sector,
          doelgroep,
          gezochte_functies,
          publieke_opmerking,
          location:client_locations!location_id (
            id,
            naam,
            client_org:client_organizations!client_org_id (
              id,
              name
            )
          )
        `)
        .eq('is_active', true)
        .order('naam');

      if (error) {
        console.error('Error loading sublocations:', error);
        return [];
      }

      return (data || []) as unknown as Sublocation[];
    }
  });

  // Mark already placed locations
  const processedSublocations = useMemo(() => {
    if (!sublocations) return [];

    return sublocations.map(sub => ({
      ...sub,
      isAlreadyPlaced: existingPlacementIds.includes(sub.id)
    } as ScoredSublocation)).sort((a, b) => {
      // Sort already-placed to the bottom
      if (a.isAlreadyPlaced && !b.isAlreadyPlaced) return 1;
      if (!a.isAlreadyPlaced && b.isAlreadyPlaced) return -1;
      return a.naam.localeCompare(b.naam);
    });
  }, [sublocations, existingPlacementIds]);

  // Filter by search
  const filteredSublocations = useMemo(() => {
    if (!searchQuery.trim()) return processedSublocations;

    const query = searchQuery.toLowerCase();
    return processedSublocations.filter(sub => 
      sub.naam.toLowerCase().includes(query) ||
      sub.plaats?.toLowerCase().includes(query) ||
      sub.location?.naam?.toLowerCase().includes(query) ||
      sub.location?.client_org?.name?.toLowerCase().includes(query) ||
      sub.sector?.some(s => s.toLowerCase().includes(query)) ||
      sub.doelgroep?.some(d => d.toLowerCase().includes(query))
    );
  }, [processedSublocations, searchQuery]);

  const renderSublocationCard = (sub: ScoredSublocation) => {
    const isDisabled = sub.isAlreadyPlaced;
    
    return (
      <TooltipProvider key={sub.id}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => !isDisabled && onSelect(sub.id, sub.naam, sub)}
              disabled={isDisabled}
              className={`w-full text-left p-4 rounded-lg border transition-all group ${
                isDisabled 
                  ? "opacity-50 cursor-not-allowed bg-muted/30" 
                  : "hover:border-primary hover:bg-accent/50"
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      {sub.naam}
                      {isDisabled && (
                        <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Al geplaatst
                        </Badge>
                      )}
                    </div>
                    {sub.location?.client_org && (
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Building2 className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{sub.location.client_org.name}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {sub.plaats && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {sub.plaats}
                      </Badge>
                    )}
                  </div>
                </div>
        
                {sub.sector && sub.sector.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {sub.sector.slice(0, 3).map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                    {sub.sector.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{sub.sector.length - 3}
                      </Badge>
                    )}
                  </div>
                )}

                {sub.doelgroep && sub.doelgroep.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {sub.doelgroep.slice(0, 3).join(", ")}
                    {sub.doelgroep.length > 3 && ` +${sub.doelgroep.length - 3}`}
                  </div>
                )}
              </div>
            </button>
          </TooltipTrigger>
          {isDisabled && (
            <TooltipContent>
              <p>Professional is hier al actief geplaatst</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Zoek op naam, plaats, organisatie of sector..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          autoFocus
        />
      </div>

      {/* Tip about AI matching */}
      <p className="text-xs text-muted-foreground">
        💡 Tip: Gebruik de <strong>Matches</strong> tab in ApplicationDetailModal voor AI-gebaseerde aanbevelingen.
      </p>

      <ScrollArea className="h-[350px] pr-4">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : filteredSublocations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery ? "Geen locaties gevonden" : "Geen actieve locaties beschikbaar"}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSublocations.slice(0, 50).map(renderSublocationCard)}
            {filteredSublocations.length > 50 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Gebruik zoekfunctie voor meer resultaten ({filteredSublocations.length} totaal)
              </p>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="flex justify-between items-center pt-2 border-t">
        <div className="text-xs text-muted-foreground">
          {filteredSublocations.length} locaties
        </div>
        <Button variant="outline" onClick={onCancel}>
          Annuleren
        </Button>
      </div>
    </div>
  );
}
