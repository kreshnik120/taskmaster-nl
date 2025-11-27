import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Building2, Users, ArrowRight, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Client {
  id: string;
  name: string;
  company: string;
  tier: number;
  weekly_hours: number | null;
}

interface MatchingPanelProps {
  professionalId: string;
  professionalName: string;
  onSuccess?: () => void;
}

export function MatchingPanel({ professionalId, professionalName, onSuccess }: MatchingPanelProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    loadAvailableClients();
  }, [professionalId]);

  const loadAvailableClients = async () => {
    try {
      // Get current user's org
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data: userOrg } = await supabase
        .from("user_organizations")
        .select("org_id")
        .eq("user_id", userData.user.id)
        .single();

      if (!userOrg) return;

      // Load all clients
      const { data: allClients, error: clientsError } = await supabase
        .from("clients")
        .select("*")
        .eq("org_id", userOrg.org_id)
        .order("tier", { ascending: true });

      if (clientsError) throw clientsError;

      // Get existing matches for this professional
      const { data: existingMatches } = await supabase
        .from("professional_client_matches")
        .select("client_id")
        .eq("professional_id", professionalId);

      const matchedClientIds = new Set(existingMatches?.map(m => m.client_id) || []);

      // Filter out already matched clients
      const available = allClients?.filter(c => !matchedClientIds.has(c.id)) || [];
      setClients(available);
    } catch (error: any) {
      console.error("Error loading clients:", error);
      toast.error("Kon klanten niet laden");
    } finally {
      setLoading(false);
    }
  };

  const createMatch = async (clientId: string) => {
    setCreating(clientId);
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
          client_id: clientId,
          org_id: userOrg.org_id,
          created_by: userData.user.id,
          status: "suggested",
          match_score: 0.75 // Default score
        });

      if (error) throw error;

      toast.success("Plaatsing aangemaakt");
      loadAvailableClients(); // Refresh list
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
        Beschikbare klanten laden...
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="text-center py-8 space-y-2">
        <Users className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground">
          Alle klanten zijn al gekoppeld aan deze professional
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4" />
        <span>Beschikbare klanten voor {professionalName}</span>
      </div>

      <Separator />

      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {clients.map((client) => (
          <Card key={client.id} className="hover:shadow-sm transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{client.name}</span>
                </div>
                <Badge variant={client.tier === 1 ? "default" : "secondary"} className="text-xs">
                  Tier {client.tier}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <p className="text-sm text-muted-foreground">{client.company}</p>
              
              {client.weekly_hours && (
                <p className="text-sm text-muted-foreground">
                  {client.weekly_hours} uur/week
                </p>
              )}

              <Button
                size="sm"
                className="w-full"
                onClick={() => createMatch(client.id)}
                disabled={creating === client.id}
              >
                {creating === client.id ? (
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
