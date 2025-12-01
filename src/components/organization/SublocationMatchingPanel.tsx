import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { MapPin, Briefcase, Users, TrendingUp, CheckCircle2, Calendar, Clock, XCircle } from "lucide-react";
import { calculateSublocationMatchScore, parseBeschikbaarheid } from "@/lib/calculateSublocationMatchScore";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { PlacementConfirmDialog } from "./PlacementConfirmDialog";

interface SublocationMatchingPanelProps {
  sublocationId: string;
  sublocationName: string;
  gezochte_functies: string[];
  sector: string[];
  doelgroep: string[];
  plaats: string;
  capaciteit_min?: number | null;
  capaciteit_max?: number | null;
}

interface Professional {
  id: string;
  full_name: string;
  functie_niveau: string;
  werkvorm: string;
  regio: string | null;
  woonplaats: string | null;
  postcode: string | null;
  skills: string[];
  status: string;
  beschikbaarheidsnotities: string | null;
  heeft_auto: boolean | null;
  heeft_rijbewijs: boolean | null;
  ervaring_sector?: string[] | null;
  doelgroep_ervaring?: string[] | null;
}

interface Assignment {
  id: string;
  professional_id: string;
  start_date: string;
  end_date: string | null;
  weekly_hours: number;
  status: string;
  professionals: {
    full_name: string;
    functie_niveau: string;
  };
  hourly_rates: {
    uursoort_naam: string;
    basis_tarief: number;
  } | null;
}

export function SublocationMatchingPanel({
  sublocationId,
  sublocationName,
  gezochte_functies,
  sector,
  doelgroep,
  plaats,
  capaciteit_min,
  capaciteit_max,
}: SublocationMatchingPanelProps) {
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState<{
    id: string;
    name: string;
    matchScore: number;
  } | null>(null);

  // Fetch active assignments
  const { data: assignments, isLoading: assignmentsLoading, refetch: refetchAssignments } = useQuery({
    queryKey: ["assignments", sublocationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select(`
          *,
          professionals:professional_id (
            full_name,
            functie_niveau
          ),
          hourly_rates:hourly_rate_id (
            uursoort_naam,
            basis_tarief
          )
        `)
        .eq("sublocation_id", sublocationId)
        .in("status", ["active", "draft"]);

      if (error) throw error;
      return data as Assignment[];
    },
  });

  // Fetch professionals for matching
  const { data: professionals, isLoading: professionalsLoading } = useQuery({
    queryKey: ["professionals-for-matching", sublocationId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: userOrg } = await supabase
        .from("user_organizations")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (!userOrg) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("professionals")
        .select(`
          *,
          professional_applications!professional_applications_professional_id_fkey(
            extracted_data
          )
        `)
        .eq("org_id", userOrg.org_id)
        .is("deleted_at", null)
        .in("status", ["actief", "beschikbaar"]);

      if (error) throw error;
      
      // Enrich with extracted_data from applications
      return (data as any[]).map((prof) => {
        const application = prof.professional_applications?.[0];
        const extractedData = application?.extracted_data || {};
        
        return {
          id: prof.id,
          full_name: prof.full_name,
          functie_niveau: prof.functie_niveau,
          werkvorm: prof.werkvorm,
          regio: prof.regio,
          woonplaats: prof.woonplaats,
          postcode: prof.postcode,
          skills: prof.skills || [],
          status: prof.status,
          beschikbaarheidsnotities: prof.beschikbaarheidsnotities,
          beschikbaarheid_uren: parseBeschikbaarheid(extractedData.beschikbaarheid || prof.beschikbaarheidsnotities),
          heeft_auto: prof.heeft_auto,
          heeft_rijbewijs: prof.heeft_rijbewijs,
          ervaring_sector: extractedData.ervaring_sector || [],
          doelgroep_ervaring: extractedData.doelgroep_ervaring || [],
        } as Professional;
      });
    },
  });

  const handleEndAssignment = async (assignmentId: string, professionalName: string) => {
    try {
      const { error } = await supabase
        .from("assignments")
        .update({
          status: "ended",
          end_date: new Date().toISOString().split('T')[0],
        })
        .eq("id", assignmentId);

      if (error) throw error;

      // Log event for AI learning
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userOrgData } = await supabase
          .from("user_organizations")
          .select("org_id")
          .eq("user_id", user.id)
          .single();

        if (userOrgData?.org_id) {
          await supabase.from("system_events").insert({
            entity_type: "assignment",
            entity_id: assignmentId,
            event_type: "placement_ended",
            event_data: {
              assignment_id: assignmentId,
              professional_name: professionalName,
              sublocation_id: sublocationId,
              sublocation_name: sublocationName,
            },
            metadata: {},
            org_id: userOrgData.org_id,
            user_id: user.id,
          });
        }
      }

      toast.success("Plaatsing beëindigd", {
        description: `Plaatsing van ${professionalName} is beëindigd`,
      });

      refetchAssignments();
    } catch (error) {
      console.error("End assignment error:", error);
      toast.error("Fout bij beëindigen plaatsing");
    }
  };

  const openConfirmDialog = (professionalId: string, professionalName: string, matchScore: number) => {
    setSelectedProfessional({ id: professionalId, name: professionalName, matchScore });
    setConfirmDialogOpen(true);
  };

  const isLoading = assignmentsLoading || professionalsLoading;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const activeAssignments = assignments?.filter((a) => a.status === "active") || [];
  const draftAssignments = assignments?.filter((a) => a.status === "draft") || [];

  // Calculate match scores and sort
  const professionalsWithScores = professionals
    .map((prof) => ({
      ...prof,
      matchScore: calculateSublocationMatchScore(prof, {
        gezochte_functies,
        sector,
        doelgroep,
        plaats,
        capaciteit_min,
        capaciteit_max,
      }),
    }))
    .sort((a, b) => b.matchScore.totalScore - a.matchScore.totalScore);

  return (
    <div className="space-y-6">
      {/* Active Assignments Section */}
      {(activeAssignments.length > 0 || draftAssignments.length > 0) && (
        <>
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold">✅ Actieve Plaatsingen</h3>
                <p className="text-sm text-muted-foreground">
                  {activeAssignments.length + draftAssignments.length} actieve plaatsing(en)
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {[...activeAssignments, ...draftAssignments].map((assignment) => (
                <Card key={assignment.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                            {assignment.professionals.full_name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{assignment.professionals.full_name}</h4>
                            <Badge
                              variant={assignment.status === "active" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {assignment.status === "active" ? "Actief" : "Concept"}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-2">
                            <div className="flex items-center gap-1">
                              <Briefcase className="h-3.5 w-3.5" />
                              {assignment.professionals.functie_niveau}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              sinds {format(new Date(assignment.start_date), "d MMM yyyy", { locale: nl })}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {assignment.weekly_hours} uur/week
                            </div>
                          </div>

                          {assignment.hourly_rates && (
                            <div className="text-xs text-muted-foreground">
                              {assignment.hourly_rates.uursoort_naam} · €{assignment.hourly_rates.basis_tarief.toFixed(2)}/uur
                            </div>
                          )}
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEndAssignment(assignment.id, assignment.professionals.full_name)}
                        className="shrink-0"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Beëindig plaatsing
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <Separator />
        </>
      )}

      {/* Available Professionals Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold">👤 Beschikbare Professionals</h3>
            <p className="text-sm text-muted-foreground">
              {professionalsWithScores.length} passende professional(s)
            </p>
          </div>
        </div>

        {!professionals || professionals.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Geen beschikbare professionals gevonden</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {professionalsWithScores.map((prof) => (
              <Card key={prof.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {prof.full_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">{prof.full_name}</h4>
                          <Badge
                            variant={
                              prof.matchScore.totalScore >= 80
                                ? "default"
                                : prof.matchScore.totalScore >= 60
                                ? "secondary"
                                : "outline"
                            }
                            className="flex items-center gap-1"
                          >
                            <TrendingUp className="h-3 w-3" />
                            {prof.matchScore.totalScore}% match
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-2">
                          <div className="flex items-center gap-1">
                            <Briefcase className="h-3.5 w-3.5" />
                            {prof.functie_niveau}
                          </div>
                          {prof.regio && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {prof.regio}
                            </div>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {prof.werkvorm}
                          </Badge>
                        </div>

                         {/* Match breakdown */}
                        <div className="flex flex-wrap gap-2 text-xs">
                          {prof.matchScore.functieMatch > 0 && (
                            <Badge variant="secondary" className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Functie: {prof.matchScore.functieMatch}
                            </Badge>
                          )}
                          {prof.matchScore.regioMatch > 0 && (
                            <Badge variant="secondary" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Regio: {prof.matchScore.regioMatch}
                            </Badge>
                          )}
                          {prof.matchScore.sectorMatch > 0 && (
                            <Badge variant="secondary" className="bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Sector: {prof.matchScore.sectorMatch}
                            </Badge>
                          )}
                          {prof.matchScore.doelgroepMatch > 0 && (
                            <Badge variant="secondary" className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Doelgroep: {prof.matchScore.doelgroepMatch}
                            </Badge>
                          )}
                          {prof.matchScore.mobiliteitMatch > 0 && (
                            <Badge variant="secondary" className="bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Mobiliteit: {prof.matchScore.mobiliteitMatch}
                            </Badge>
                          )}
                          {prof.matchScore.beschikbaarheidMatch > 0 && (
                            <Badge variant="secondary" className="bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Beschikbaarheid: {prof.matchScore.beschikbaarheidMatch}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={() => openConfirmDialog(prof.id, prof.full_name, prof.matchScore.totalScore)}
                      className="shrink-0"
                    >
                      Plaats hier
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Placement Confirmation Dialog */}
      {selectedProfessional && (
        <PlacementConfirmDialog
          open={confirmDialogOpen}
          onOpenChange={setConfirmDialogOpen}
          professionalId={selectedProfessional.id}
          professionalName={selectedProfessional.name}
          sublocationId={sublocationId}
          sublocationName={sublocationName}
          matchScore={selectedProfessional.matchScore}
          onSuccess={() => {
            refetchAssignments();
          }}
        />
      )}
    </div>
  );
}
