import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Building2, Users, ArrowRight, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Sublocation {
  id: string;
  naam: string;
  sector: string[] | null;
  location: {
    naam: string;
    client_org: {
      id: string;
      name: string;
      org_id: string;
    } | null;
  } | null;
}

interface MatchingPanelProps {
  professionalId: string;
  professionalName: string;
  onSuccess?: () => void;
}

export function MatchingPanel({ professionalId, professionalName, onSuccess }: MatchingPanelProps) {
  const [sublocations, setSublocations] = useState<Sublocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    loadAvailableSublocations();
  }, [professionalId]);

  const loadAvailableSublocations = async () => {
    try {
      // Get current user's orgs
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data: userOrgs } = await supabase
        .from("user_organizations")
        .select("org_id")
        .eq("user_id", userData.user.id);

      if (!userOrgs || userOrgs.length === 0) return;

      const orgIds = userOrgs.map(uo => uo.org_id);

      // Load all sublocations with hierarchy
      const { data: allSublocations, error: sublocationsError } = await supabase
        .from("client_sublocations")
        .select(`
          id, naam, sector,
          location:client_locations!location_id (
            naam,
            client_org:client_organizations!client_org_id (
              id, name, org_id
            )
          )
        `)
        .eq("is_active", true)
        .order("naam");

      if (sublocationsError) throw sublocationsError;

      // Filter by user's organizations
      const filteredByOrg = (allSublocations || []).filter(sub => 
        sub.location?.client_org?.org_id && orgIds.includes(sub.location.client_org.org_id)
      );

      // Get existing matches for this professional
      const { data: existingMatches } = await supabase
        .from("professional_client_matches")
        .select("client_id")
        .eq("professional_id", professionalId);

      const matchedIds = new Set(existingMatches?.map(m => m.client_id) || []);

      // Filter out already matched sublocations
      const available = filteredByOrg.filter(sub => !matchedIds.has(sub.id));
      setSublocations(available);
    } catch (error: any) {
      console.error("Error loading sublocations:", error);
      toast.error("Kon werklocaties niet laden");
    } finally {
      setLoading(false);
    }
  };

  const createMatch = async (sublocationId: string) => {
    setCreating(sublocationId);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Niet ingelogd");

      const { data: userOrg } = await supabase
        .from("user_organizations")
        .select("org_id")
        .eq("user_id", userData.user.id)
        .single();

      if (!userOrg) throw new Error("Geen organisatie gevonden");

      const { error } = await supabase
        .from("professional_client_matches")
        .insert({
          professional_id: professionalId,
          client_id: sublocationId,
          org_id: userOrg.org_id,
          created_by: userData.user.id,
          status: "suggested",
          match_score: 0.75
        });

      if (error) throw error;

      toast.success("Plaatsing aangemaakt");
      loadAvailableSublocations();
      onSuccess?.();
    } catch (error: any) {
      console.error("Error creating match:", error);
      toast.error(`Fout bij aanmaken: ${error.message}`);
    } finally {
      setCreating(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Beschikbare werklocaties laden...
      </div>
    );
  }

  if (sublocations.length === 0) {
    return (
      <div className="text-center py-8 space-y-2">
        <Users className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground">
          Alle werklocaties zijn al gekoppeld aan deze professional
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4" />
        <span>Beschikbare werklocaties voor {professionalName}</span>
      </div>

      <Separator />

      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {sublocations.map((sub) => (
          <Card key={sub.id} className="hover:shadow-sm transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{sub.naam}</span>
                </div>
                {sub.sector && sub.sector.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {sub.sector[0]}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <p className="text-sm text-muted-foreground">
                {sub.location?.client_org?.name || 'Onbekende organisatie'}
              </p>

              <Button
                size="sm"
                className="w-full"
                onClick={() => createMatch(sub.id)}
                disabled={creating === sub.id}
              >
                {creating === sub.id ? (
                  "Aanmaken..."
                ) : (
                  <>
                    Maak plaatsing
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
