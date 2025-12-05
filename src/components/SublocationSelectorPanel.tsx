import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MapPin, Building2, Sparkles, Search, SlidersHorizontal, CheckCircle2 } from "lucide-react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { 
  preloadExpertKnowledge, 
  calculateUnifiedMatchScore,
  parseBeschikbaarheid,
  type MatchScoreBreakdown 
} from "@/lib/services/matchingService";
import { PlacementConfirmDialog } from "@/components/organization/PlacementConfirmDialog";
import { getActivePlacementSublocationIds } from "@/lib/checkExistingPlacement";

interface Professional {
  id: string;
  full_name: string;
  functie_niveau: string | null;
  werkvorm: string | null;
  regio: string | null;
  woonplaats: string | null;
  postcode: string | null;
  provincie?: string | null;
  skills: string[] | null;
  status: string | null;
  beschikbaarheidsnotities: string | null;
  heeft_auto: boolean | null;
  heeft_rijbewijs: boolean | null;
  ervaring_sector?: string[] | null;
  doelgroep_ervaring?: string[] | null;
  eigen_vervoer?: boolean | null;
  certificaten?: string[] | null;
  specialisaties?: string[] | null;
  talen?: string[] | null;
  regio_voorkeur?: string[] | null;
  specifieke_doelgroepen?: string[] | null;
  max_reisafstand_km?: number | null;
  jaren_ervaring?: number | null;
  leidinggevende_ervaring?: boolean | null;
  nachtdienst_bereid?: boolean | null;
  weekenddienst_bereid?: boolean | null;
}

interface Sublocation {
  id: string;
  naam: string;
  plaats: string | null;
  provincie: string | null;
  postcode?: string | null;
  sector: string[] | null;
  doelgroep: string[] | null;
  gezochte_functies: string[] | null;
  publieke_opmerking?: string | null;
  capaciteit_min: number | null;
  capaciteit_max: number | null;
  location: {
    naam: string;
    client_org: {
      name: string;
    };
  };
}

interface SublocationSelectorPanelProps {
  professionalId: string;
  professionalName: string;
  professionalData: Professional;
  onSuccess?: () => void;
}

export function SublocationSelectorPanel({
  professionalId,
  professionalName,
  professionalData,
  onSuccess,
}: SublocationSelectorPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [doelgroepFilter, setDoelgroepFilter] = useState<string>("all");
  const [functieFilter, setFunctieFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedSublocation, setSelectedSublocation] = useState<any>(null);
  const [expertsLoaded, setExpertsLoaded] = useState(false);
  const [existingPlacementIds, setExistingPlacementIds] = useState<string[]>([]);

  // Preload expert knowledge on mount
  useEffect(() => {
    preloadExpertKnowledge().then(() => setExpertsLoaded(true));
  }, []);

  // Fetch existing active placements for this professional
  useEffect(() => {
    if (professionalId) {
      getActivePlacementSublocationIds(professionalId).then(setExistingPlacementIds);
    }
  }, [professionalId]);

  // Fetch sublocations with rates
  const { data: sublocations, isLoading } = useQuery({
    queryKey: ["sublocations-with-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_sublocations")
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
          capaciteit_min,
          capaciteit_max,
          location:client_locations(
            naam,
            client_org:client_organizations(name)
          )
        `)
        .eq("is_active", true)
        .order("naam");

      if (error) throw error;
      return data as unknown as Sublocation[];
    },
  });

  // Calculate match scores using unified matching service
  const processedSublocations = sublocations
    ?.map((sublocation) => {
      // Use unified matching service with full features
      const matchResult = expertsLoaded ? calculateUnifiedMatchScore(
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
          beschikbaarheid_uren: parseBeschikbaarheid(professionalData.beschikbaarheidsnotities),
          nachtdienst_bereid: professionalData.nachtdienst_bereid,
          weekenddienst_bereid: professionalData.weekenddienst_bereid,
          certificaten: professionalData.certificaten,
          werkvorm: professionalData.werkvorm,
          specialisaties: professionalData.specialisaties,
        },
        {
          gezochte_functies: sublocation.gezochte_functies || [],
          sector: sublocation.sector || [],
          doelgroep: sublocation.doelgroep || [],
          plaats: sublocation.plaats,
          provincie: sublocation.provincie,
          postcode: sublocation.postcode,
          capaciteit_min: sublocation.capaciteit_min,
          capaciteit_max: sublocation.capaciteit_max,
          publieke_opmerking: sublocation.publieke_opmerking,
        }
      ) : {
        normalizedScore: 0,
        reasoning: [] as string[],
        totalScore: 0,
        functieMatch: 0,
        regioMatch: 0,
        sectorMatch: 0,
        doelgroepMatch: 0,
        mobiliteitMatch: 0,
        beschikbaarheidMatch: 0,
        werkvormMatch: 0,
        beschrijvingMatch: 0,
        certificaatVereistMatch: 0,
        trackRecordBonus: 0,
        expertBonus: 0,
        ervaringBonus: 0,
        leidinggevendeBonus: 0,
        certificatenBonus: 0,
        dienstBonus: 0,
        aiBoost: 0,
        hasAIBoost: false,
        hasTrackRecord: false,
        hasExpertAdvies: false,
        expertAdvies: [],
        aiBoostReasons: [],
        usedPatternIds: [],
        bonusTotal: 0,
        bonusPercentage: 0,
        categoryContributions: { geschiktheid: { points: 0, max: 60, percentage: 0 }, locatie: { points: 0, max: 30, percentage: 0 }, ervaring: { points: 0, max: 25, percentage: 0 }, praktisch: { points: 0, max: 10, percentage: 0 } },
        details: {}
      };

      return {
        ...sublocation,
        matchScore: matchResult.normalizedScore,
        matchBreakdown: matchResult,
        isAlreadyPlaced: existingPlacementIds.includes(sublocation.id),
      };
    })
    .filter((sublocation) => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesSearch =
          sublocation.naam.toLowerCase().includes(search) ||
          sublocation.plaats?.toLowerCase().includes(search) ||
          sublocation.location.naam.toLowerCase().includes(search) ||
          sublocation.location.client_org.name.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }

      // Sector filter
      if (sectorFilter !== "all") {
        if (!sublocation.sector?.includes(sectorFilter)) return false;
      }

      // Doelgroep filter
      if (doelgroepFilter !== "all") {
        if (!sublocation.doelgroep?.includes(doelgroepFilter)) return false;
      }

      // Functie filter
      if (functieFilter !== "all") {
        if (!sublocation.gezochte_functies?.includes(functieFilter)) return false;
      }

      return true;
    })
    .sort((a, b) => {
      // Sort already-placed to the bottom
      if (a.isAlreadyPlaced && !b.isAlreadyPlaced) return 1;
      if (!a.isAlreadyPlaced && b.isAlreadyPlaced) return -1;
      return b.matchScore - a.matchScore;
    });

  const openConfirmDialog = (sublocation: any) => {
    setSelectedSublocation(sublocation);
    setConfirmDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Beschikbare werklocaties laden...
      </div>
    );
  }

  if (!sublocations || sublocations.length === 0) {
    return (
      <div className="text-center py-8 space-y-2">
        <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground">Geen werklocaties beschikbaar</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zoek werklocatie, plaats of organisatie..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? "bg-accent" : ""}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>

        <Collapsible open={showFilters}>
          <CollapsibleContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-muted/30 rounded-lg">
              <Select value={sectorFilter} onValueChange={setSectorFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle sectoren" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle sectoren</SelectItem>
                  <SelectItem value="VVT">VVT</SelectItem>
                  <SelectItem value="GGZ">GGZ</SelectItem>
                  <SelectItem value="GHZ">GHZ</SelectItem>
                  <SelectItem value="Jeugdzorg">Jeugdzorg</SelectItem>
                </SelectContent>
              </Select>

              <Select value={doelgroepFilter} onValueChange={setDoelgroepFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle doelgroepen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle doelgroepen</SelectItem>
                  <SelectItem value="Ouderen">Ouderen</SelectItem>
                  <SelectItem value="LVB">LVB</SelectItem>
                  <SelectItem value="Psychiatrie">Psychiatrie</SelectItem>
                  <SelectItem value="Somatiek">Somatiek</SelectItem>
                </SelectContent>
              </Select>

              <Select value={functieFilter} onValueChange={setFunctieFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle functies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle functies</SelectItem>
                  <SelectItem value="VIG">VIG</SelectItem>
                  <SelectItem value="HBO-V">HBO-V</SelectItem>
                  <SelectItem value="Begeleider">Begeleider</SelectItem>
                  <SelectItem value="Verpleegkundige MBO">Verpleegkundige MBO</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Results Header */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4" />
        <span>
          {processedSublocations?.length || 0} passende werklocaties voor {professionalName}
        </span>
      </div>

      {/* Sublocations List */}
      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {processedSublocations?.map((sublocation) => {
          const isDisabled = sublocation.isAlreadyPlaced;
          
          return (
            <TooltipProvider key={sublocation.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Card 
                    className={`transition-shadow ${
                      isDisabled 
                        ? "opacity-50 cursor-not-allowed" 
                        : "hover:shadow-sm"
                    }`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {sublocation.naam}
                            {isDisabled && (
                              <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Al geplaatst
                              </Badge>
                            )}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {sublocation.location.naam} • {sublocation.location.client_org.name}
                          </p>
                        </div>
                        {!isDisabled && (
                          <Badge
                            variant={
                              sublocation.matchScore >= 80
                                ? "default"
                                : sublocation.matchScore >= 60
                                ? "secondary"
                                : "outline"
                            }
                            className="text-xs"
                          >
                            {Math.round(sublocation.matchScore)}% match
                          </Badge>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 pt-0">
                      {/* Location & Info */}
                      {sublocation.plaats && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          {sublocation.plaats}
                        </div>
                      )}

                      {/* Match Breakdown - only show if not already placed */}
                      {!isDisabled && sublocation.matchScore > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Match details:</p>
                          <div className="space-y-1">
                            {sublocation.matchBreakdown.reasoning.map((reason: string, idx: number) => (
                              <p key={idx} className="text-xs text-muted-foreground">
                                • {reason}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      {!isDisabled && (
                        <p className="text-xs text-muted-foreground italic mt-2">
                          💡 Tarieven worden bepaald na keuze werkvorm
                        </p>
                      )}

                      {/* Action Button */}
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => !isDisabled && openConfirmDialog(sublocation)}
                        disabled={isDisabled}
                      >
                        {isDisabled ? "Al geplaatst" : "Plaats hier"}
                        {!isDisabled && <Sparkles className="h-4 w-4 ml-2" />}
                      </Button>
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                {isDisabled && (
                  <TooltipContent>
                    <p>Professional is hier al actief geplaatst</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>

      {/* Placement Confirm Dialog */}
      {selectedSublocation && (
        <PlacementConfirmDialog
          open={confirmDialogOpen}
          onOpenChange={setConfirmDialogOpen}
          professionalId={professionalId}
          professionalName={professionalName}
          sublocationId={selectedSublocation.id}
          sublocationName={selectedSublocation.naam}
          matchScore={selectedSublocation.matchScore}
          onSuccess={() => {
            setConfirmDialogOpen(false);
            onSuccess?.();
          }}
        />
      )}
    </div>
  );
}
