import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Building2, MapPin, Users, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  preloadExpertKnowledge, 
  calculateUnifiedMatchScore,
  parseBeschikbaarheid,
  type MatchScoreBreakdown 
} from "@/lib/services/matchingService";

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
  professionalData?: ProfessionalData;
  onSelect: (sublocationId: string, sublocationName: string, sublocationData?: ScoredSublocation) => void;
  onCancel: () => void;
}

export interface ScoredSublocation extends Sublocation {
  matchScore: number;
  matchBreakdown?: MatchScoreBreakdown;
  isRecommended: boolean;
}

export function SmartSublocationPicker({ 
  professionalData, 
  onSelect, 
  onCancel 
}: SmartSublocationPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllLocations, setShowAllLocations] = useState(false);
  const [expertsLoaded, setExpertsLoaded] = useState(false);

  // Preload expert knowledge on mount
  useEffect(() => {
    preloadExpertKnowledge().then(() => setExpertsLoaded(true));
  }, []);

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

  // Calculate match scores using the unified matching service
  const scoredSublocations = useMemo(() => {
    if (!sublocations) return [];

    return sublocations.map(sub => {
      let matchScore = 0;
      let matchBreakdown: MatchScoreBreakdown | undefined;

      if (professionalData && expertsLoaded) {
        // Use unified matching service with full features
        const result = calculateUnifiedMatchScore(
          {
            functie_niveau: professionalData.functie_niveau || null,
            regio: professionalData.regio || professionalData.woonplaats || null,
            woonplaats: professionalData.woonplaats,
            postcode: professionalData.postcode,
            provincie: professionalData.provincie,
            ervaring_sector: professionalData.ervaring_sector,
            doelgroep_ervaring: professionalData.doelgroep_ervaring,
            jaren_ervaring: professionalData.jaren_ervaring,
            leidinggevende_ervaring: professionalData.leidinggevende_ervaring,
            heeft_auto: professionalData.heeft_auto,
            heeft_rijbewijs: professionalData.heeft_rijbewijs,
            eigen_vervoer: professionalData.eigen_vervoer,
            beschikbaarheid_uren: parseBeschikbaarheid(professionalData.beschikbaarheid || null),
            nachtdienst_bereid: professionalData.nachtdienst_bereid,
            weekenddienst_bereid: professionalData.weekenddienst_bereid,
            certificaten: professionalData.certificaten,
            werkvorm: professionalData.werkvorm,
            specialisaties: professionalData.specialisaties,
          },
          {
            gezochte_functies: sub.gezochte_functies,
            sector: sub.sector,
            doelgroep: sub.doelgroep,
            plaats: sub.plaats,
            provincie: sub.provincie,
            postcode: sub.postcode,
            publieke_opmerking: sub.publieke_opmerking,
          }
        );
        
        matchScore = result.normalizedScore;
        matchBreakdown = result;
      }

      return {
        ...sub,
        matchScore,
        matchBreakdown,
        isRecommended: matchScore >= 50
      } as ScoredSublocation;
    }).sort((a, b) => b.matchScore - a.matchScore);
  }, [sublocations, professionalData, expertsLoaded]);

  // Filter by search
  const filteredSublocations = useMemo(() => {
    if (!searchQuery.trim()) return scoredSublocations;

    const query = searchQuery.toLowerCase();
    return scoredSublocations.filter(sub => 
      sub.naam.toLowerCase().includes(query) ||
      sub.plaats?.toLowerCase().includes(query) ||
      sub.location?.naam?.toLowerCase().includes(query) ||
      sub.location?.client_org?.name?.toLowerCase().includes(query) ||
      sub.sector?.some(s => s.toLowerCase().includes(query)) ||
      sub.doelgroep?.some(d => d.toLowerCase().includes(query))
    );
  }, [scoredSublocations, searchQuery]);

  // Split into recommended and other
  const recommendedLocations = filteredSublocations.filter(s => s.isRecommended).slice(0, 5);
  const otherLocations = showAllLocations 
    ? filteredSublocations.filter(s => !s.isRecommended || filteredSublocations.indexOf(s) >= 5)
    : [];

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-600 bg-emerald-500/10 border-emerald-200";
    if (score >= 60) return "text-amber-600 bg-amber-500/10 border-amber-200";
    return "text-muted-foreground bg-muted/50 border-border";
  };

  const renderSublocationCard = (sub: ScoredSublocation) => (
    <button
      key={sub.id}
      onClick={() => onSelect(sub.id, sub.naam, sub)}
      className="w-full text-left p-4 rounded-lg border hover:border-primary hover:bg-accent/50 transition-all group"
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{sub.naam}</div>
            {sub.location?.client_org && (
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{sub.location.client_org.name}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {sub.matchScore > 0 && (
              <Badge 
                variant="outline" 
                className={`text-xs font-medium ${getScoreColor(sub.matchScore)}`}
              >
                {Math.round(sub.matchScore)}%
              </Badge>
            )}
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
  );

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

      <ScrollArea className="h-[400px] pr-4">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : filteredSublocations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery ? "Geen locaties gevonden" : "Geen actieve locaties beschikbaar"}
          </div>
        ) : (
          <div className="space-y-4">
            {/* AI Recommended Section */}
            {recommendedLocations.length > 0 && professionalData && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Sparkles className="h-4 w-4" />
                  AI Aanbevelingen
                  <Badge variant="secondary" className="text-xs">
                    Top {recommendedLocations.length}
                  </Badge>
                </div>
                <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
                  {recommendedLocations.map(renderSublocationCard)}
                </div>
              </div>
            )}

            {/* Other Locations - Collapsible */}
            <Collapsible open={showAllLocations} onOpenChange={setShowAllLocations}>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-between text-sm text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Alle locaties ({filteredSublocations.length - recommendedLocations.length})
                  </span>
                  {showAllLocations ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2">
                {filteredSublocations
                  .filter(s => !recommendedLocations.includes(s))
                  .slice(0, 50)
                  .map(renderSublocationCard)}
                {filteredSublocations.length > 50 + recommendedLocations.length && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Gebruik zoekfunctie voor meer resultaten
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* If no professionalData, show all in flat list */}
            {!professionalData && (
              <div className="space-y-2">
                {filteredSublocations.slice(0, 50).map(renderSublocationCard)}
              </div>
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
