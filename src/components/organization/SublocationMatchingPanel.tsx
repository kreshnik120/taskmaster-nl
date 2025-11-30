import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Briefcase, Users, TrendingUp, CheckCircle2 } from "lucide-react";
import { calculateSublocationMatchScore } from "@/lib/calculateSublocationMatchScore";
import { toast } from "sonner";

interface SublocationMatchingPanelProps {
  sublocationId: string;
  sublocationName: string;
  gezochte_functies: string[];
  sector: string[];
  doelgroep: string[];
  plaats: string;
}

interface Professional {
  id: string;
  full_name: string;
  functie_niveau: string;
  werkvorm: string;
  regio: string | null;
  skills: string[];
  status: string;
  beschikbaarheidsnotities: string | null;
}

export function SublocationMatchingPanel({
  sublocationId,
  sublocationName,
  gezochte_functies,
  sector,
  doelgroep,
  plaats,
}: SublocationMatchingPanelProps) {
  const { data: professionals, isLoading } = useQuery({
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
        .select("*")
        .eq("org_id", userOrg.org_id)
        .is("deleted_at", null)
        .in("status", ["actief", "beschikbaar"]);

      if (error) throw error;
      return data as Professional[];
    },
  });

  const handlePlacement = async (professionalId: string, professionalName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create assignment
      const { error } = await supabase
        .from("assignments")
        .insert({
          professional_id: professionalId,
          sublocation_id: sublocationId,
          start_date: new Date().toISOString().split('T')[0],
          weekly_hours: 32,
          status: "draft",
          created_by: user.id,
        });

      if (error) throw error;

      // Log event for AI learning
      const { data: userOrgData } = await supabase
        .from("user_organizations")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (userOrgData?.org_id) {
        await supabase.from("system_events").insert({
          entity_type: "assignment",
          entity_id: professionalId,
          event_type: "placement_created",
          event_data: {
            professional_id: professionalId,
            professional_name: professionalName,
            sublocation_id: sublocationId,
            sublocation_name: sublocationName,
          },
          metadata: {},
          org_id: userOrgData.org_id,
          user_id: user.id,
        });
      }

      toast.success("Plaatsing aangemaakt", {
        description: `${professionalName} gekoppeld aan ${sublocationName}`,
      });
    } catch (error) {
      console.error("Placement error:", error);
      toast.error("Fout bij aanmaken plaatsing");
    }
  };

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

  if (!professionals || professionals.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>Geen beschikbare professionals gevonden</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate match scores and sort
  const professionalsWithScores = professionals
    .map((prof) => ({
      ...prof,
      matchScore: calculateSublocationMatchScore(prof, {
        gezochte_functies,
        sector,
        doelgroep,
        plaats,
      }),
    }))
    .sort((a, b) => b.matchScore.totalScore - a.matchScore.totalScore);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Passende Professionals</h3>
          <p className="text-sm text-muted-foreground">
            {professionalsWithScores.length} professional(s) gevonden
          </p>
        </div>
      </div>

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
                          Functie: {prof.matchScore.functieMatch}%
                        </Badge>
                      )}
                      {prof.matchScore.regioMatch > 0 && (
                        <Badge variant="secondary" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Regio: {prof.matchScore.regioMatch}%
                        </Badge>
                      )}
                      {prof.matchScore.sectorMatch > 0 && (
                        <Badge variant="secondary" className="bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Sector: {prof.matchScore.sectorMatch}%
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => handlePlacement(prof.id, prof.full_name)}
                  className="shrink-0"
                >
                  Direct plaatsen
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
