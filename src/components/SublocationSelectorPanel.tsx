import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MapPin, Building2, Target, Users, Sparkles, Search, SlidersHorizontal } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { calculateSublocationMatchScore, parseBeschikbaarheid } from "@/lib/calculateSublocationMatchScore";
import { PlacementConfirmDialog } from "@/components/organization/PlacementConfirmDialog";

interface Professional {
  id: string;
  full_name: string;
  functie_niveau: string | null;
  werkvorm: string | null;
  regio: string | null;
  woonplaats: string | null;
  postcode: string | null;
  skills: string[] | null;
  status: string | null;
  beschikbaarheidsnotities: string | null;
  heeft_auto: boolean | null;
  heeft_rijbewijs: boolean | null;
  ervaring_sector?: string[] | null;
  doelgroep_ervaring?: string[] | null;
  eigen_vervoer?: boolean | null;
}

interface Sublocation {
  id: string;
  naam: string;
  plaats: string | null;
  provincie: string | null;
  sector: string[] | null;
  doelgroep: string[] | null;
  gezochte_functies: string[] | null;
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
          sector,
          doelgroep,
          gezochte_functies,
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

  // Calculate match scores and filter
  const processedSublocations = sublocations
    ?.map((sublocation) => {
      const matchResult = calculateSublocationMatchScore(
        {
          functie_niveau: professionalData.functie_niveau || "",
          regio: professionalData.regio,
          skills: professionalData.skills || [],
          beschikbaarheidsnotities: professionalData.beschikbaarheidsnotities,
          beschikbaarheid_uren: parseBeschikbaarheid(professionalData.beschikbaarheidsnotities),
          heeft_auto: professionalData.heeft_auto,
          heeft_rijbewijs: professionalData.heeft_rijbewijs,
          eigen_vervoer: professionalData.eigen_vervoer,
          woonplaats: professionalData.woonplaats,
          postcode: professionalData.postcode,
          ervaring_sector: professionalData.ervaring_sector,
          doelgroep_ervaring: professionalData.doelgroep_ervaring,
        },
        {
          gezochte_functies: sublocation.gezochte_functies || [],
          sector: sublocation.sector || [],
          doelgroep: sublocation.doelgroep || [],
          plaats: sublocation.plaats,
          provincie: sublocation.provincie,
          capaciteit_min: sublocation.capaciteit_min,
          capaciteit_max: sublocation.capaciteit_max,
        }
      );

      return {
        ...sublocation,
        matchScore: matchResult.totalScore,
        matchBreakdown: matchResult,
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
    .sort((a, b) => b.matchScore - a.matchScore);

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
        {processedSublocations?.map((sublocation) => (
          <Card key={sublocation.id} className="hover:shadow-sm transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {sublocation.naam}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {sublocation.location.naam} • {sublocation.location.client_org.name}
                  </p>
                </div>
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

              {/* Match Breakdown */}
              {sublocation.matchScore > 0 && (
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

              <p className="text-xs text-muted-foreground italic mt-2">
                💡 Tarieven worden bepaald na keuze werkvorm
              </p>

              {/* Action Button */}
              <Button
                size="sm"
                className="w-full"
                onClick={() => openConfirmDialog(sublocation)}
              >
                Plaats hier
                <Sparkles className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        ))}
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
