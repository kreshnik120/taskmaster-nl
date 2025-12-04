import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Users,
  UserPlus,
  Sparkles,
  CheckCircle2,
  Clock,
  XCircle,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { calculateVacancyMatchScore, MatchCandidate } from "@/lib/services/matchingService";

interface Vacancy {
  id: string;
  sublocation_id: string;
  titel: string;
  functie_niveau: string;
  uren_per_week_min: number | null;
  uren_per_week_max: number | null;
  start_datum: string | null;
  vereiste_certificaten: string[];
  gewenste_sector_ervaring: string[];
  gewenste_doelgroep_ervaring: string[];
}

interface VacancyMatchingPanelProps {
  vacancy: Vacancy;
  sublocationName: string;
}

interface Professional {
  id: string;
  full_name: string;
  functie_niveau: string;
  werkvorm: string;
  regio: string | null;
  woonplaats: string | null;
  beschikbaarheidsnotities: string | null;
  ervaring_sector: string[] | null;
  doelgroep_ervaring: string[] | null;
  certificaten: string[] | null;
  heeft_auto: boolean | null;
  heeft_rijbewijs: boolean | null;
  status: string;
}

interface VacancyApplication {
  id: string;
  professional_id: string;
  status: string;
  match_score: number | null;
  applied_at: string;
  professionals: {
    full_name: string;
    functie_niveau: string;
  };
}

const applicationStatusColors: Record<string, string> = {
  voorgesteld: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_gesprek: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  aangenomen: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  afgewezen: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function VacancyMatchingPanel({ vacancy, sublocationName }: VacancyMatchingPanelProps) {
  const queryClient = useQueryClient();
  const [isMatching, setIsMatching] = useState(false);

  // Fetch existing applications
  const { data: applications, isLoading: applicationsLoading } = useQuery({
    queryKey: ["vacancy-applications", vacancy.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vacancy_applications")
        .select(`
          *,
          professionals:professional_id (
            full_name,
            functie_niveau
          )
        `)
        .eq("vacancy_id", vacancy.id)
        .order("match_score", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as VacancyApplication[];
    },
  });

  // Fetch sublocation data for matching
  const { data: sublocationData } = useQuery({
    queryKey: ["sublocation-for-matching", vacancy.sublocation_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_sublocations")
        .select("plaats, provincie, sector, doelgroep")
        .eq("id", vacancy.sublocation_id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch available professionals for matching
  const { data: professionals, isLoading: professionalsLoading } = useQuery({
    queryKey: ["professionals-for-vacancy", vacancy.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("*")
        .eq("status", "beschikbaar")
        .is("deleted_at", null);

      if (error) throw error;
      return data as Professional[];
    },
  });

  // Calculate match scores for professionals
  const matchedProfessionals = professionals
    ?.filter((p) => !applications?.some((a) => a.professional_id === p.id))
    .map((prof) => {
      const candidate: MatchCandidate = {
        functie_niveau: prof.functie_niveau,
        regio: prof.regio || prof.woonplaats || "",
        woonplaats: prof.woonplaats,
        ervaring_sector: prof.ervaring_sector || [],
        doelgroep_ervaring: prof.doelgroep_ervaring || [],
        heeft_auto: prof.heeft_auto || false,
        heeft_rijbewijs: prof.heeft_rijbewijs || false,
        certificaten: prof.certificaten || [],
      };

      const vacancyForMatching = {
        id: vacancy.id,
        sublocation_id: vacancy.sublocation_id,
        titel: vacancy.titel,
        functie_niveau: vacancy.functie_niveau,
        uren_per_week: vacancy.uren_per_week_min || vacancy.uren_per_week_max || undefined,
        start_datum: vacancy.start_datum || undefined,
        vereiste_certificaten: vacancy.vereiste_certificaten,
        gewenste_sector_ervaring: vacancy.gewenste_sector_ervaring,
        gewenste_doelgroep_ervaring: vacancy.gewenste_doelgroep_ervaring,
        status: 'open' as const,
        urgentie: 'normaal' as const,
      };

      const score = calculateVacancyMatchScore(candidate, vacancyForMatching, {
        sector: sublocationData?.sector || vacancy.gewenste_sector_ervaring,
        doelgroep: sublocationData?.doelgroep || vacancy.gewenste_doelgroep_ervaring,
        plaats: sublocationData?.plaats || "",
        provincie: sublocationData?.provincie || null,
      });

      return { ...prof, matchScore: score };
    })
    .sort((a, b) => b.matchScore.normalizedScore - a.matchScore.normalizedScore)
    .slice(0, 10);

  const handleProposeProfessional = async (professional: Professional, score: number) => {
    try {
      const { error } = await supabase.from("vacancy_applications").insert({
        vacancy_id: vacancy.id,
        professional_id: professional.id,
        status: "voorgesteld",
        match_score: score,
        match_reasoning: { score, timestamp: new Date().toISOString() },
      });

      if (error) throw error;

      toast.success(`${professional.full_name} voorgesteld voor ${vacancy.titel}`);
      queryClient.invalidateQueries({ queryKey: ["vacancy-applications", vacancy.id] });
      queryClient.invalidateQueries({ queryKey: ["professionals-for-vacancy", vacancy.id] });
    } catch (error) {
      console.error("Error proposing professional:", error);
      toast.error("Kon professional niet voorstellen");
    }
  };

  const handleBulkMatch = async () => {
    if (!matchedProfessionals || matchedProfessionals.length === 0) return;

    setIsMatching(true);
    try {
      const top5 = matchedProfessionals.slice(0, 5);
      const inserts = top5.map((prof) => ({
        vacancy_id: vacancy.id,
        professional_id: prof.id,
        status: "voorgesteld",
        match_score: prof.matchScore.normalizedScore,
        match_reasoning: {
          score: prof.matchScore.normalizedScore,
          reasoning: prof.matchScore.reasoning,
          timestamp: new Date().toISOString(),
        },
      }));

      const { error } = await supabase.from("vacancy_applications").insert(inserts);

      if (error) throw error;

      toast.success(`${top5.length} professionals voorgesteld`);
      queryClient.invalidateQueries({ queryKey: ["vacancy-applications", vacancy.id] });
      queryClient.invalidateQueries({ queryKey: ["professionals-for-vacancy", vacancy.id] });
    } catch (error) {
      console.error("Error bulk matching:", error);
      toast.error("Kon professionals niet voorstellen");
    } finally {
      setIsMatching(false);
    }
  };

  const handleUpdateApplicationStatus = async (applicationId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("vacancy_applications")
        .update({ status: newStatus })
        .eq("id", applicationId);

      if (error) throw error;

      toast.success("Status bijgewerkt");
      queryClient.invalidateQueries({ queryKey: ["vacancy-applications", vacancy.id] });
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Kon status niet bijwerken");
    }
  };

  if (applicationsLoading || professionalsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Applications */}
      {applications && applications.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Voorgestelde kandidaten ({applications.length})
          </h4>
          <div className="space-y-2">
            {applications.map((app) => (
              <Card key={app.id} className="border">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {app.professionals.full_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{app.professionals.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {app.professionals.functie_niveau}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {app.match_score && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="text-xs">
                                <TrendingUp className="h-3 w-3 mr-1" />
                                {app.match_score}%
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>Match score</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <Badge className={applicationStatusColors[app.status] || "bg-muted"}>
                        {app.status === "voorgesteld" && <Clock className="h-3 w-3 mr-1" />}
                        {app.status === "aangenomen" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {app.status === "afgewezen" && <XCircle className="h-3 w-3 mr-1" />}
                        {app.status}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Available Professionals */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Beschikbare professionals
          </h4>
          {matchedProfessionals && matchedProfessionals.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkMatch}
              disabled={isMatching}
            >
              <UserPlus className="h-3 w-3 mr-1" />
              Top 5 voorstellen
            </Button>
          )}
        </div>

        {matchedProfessionals && matchedProfessionals.length > 0 ? (
          <div className="space-y-2">
            {matchedProfessionals.map((prof) => (
              <Card
                key={prof.id}
                className="border hover:border-primary/50 transition-colors"
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {prof.full_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{prof.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {prof.functie_niveau} • {prof.woonplaats || prof.regio || "Onbekend"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Match</span>
                          <span
                            className={
                              prof.matchScore.normalizedScore >= 70
                                ? "text-green-600"
                                : prof.matchScore.normalizedScore >= 50
                                ? "text-amber-600"
                                : "text-red-600"
                            }
                          >
                            {prof.matchScore.normalizedScore}%
                          </span>
                        </div>
                        <Progress
                          value={prof.matchScore.normalizedScore}
                          className="h-1.5"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          handleProposeProfessional(prof, prof.matchScore.normalizedScore)
                        }
                      >
                        <UserPlus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Geen beschikbare professionals gevonden</p>
            <p className="text-xs mt-1">
              Pas filters aan of voeg professionals toe
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
