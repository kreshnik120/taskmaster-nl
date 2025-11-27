import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Users, Building2, Calendar, TrendingUp, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface Placement {
  id: string;
  professional_id: string;
  client_id: string;
  status: string;
  match_score: number | null;
  created_at: string;
  professionals: {
    full_name: string;
    functie_niveau: string;
  };
  clients: {
    name: string;
    company: string;
  };
}

export default function Plaatsingen() {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const navigate = useNavigate();

  useEffect(() => {
    loadPlacements();
  }, []);

  const loadPlacements = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("professional_client_matches")
        .select(`
          *,
          professionals (full_name, functie_niveau),
          clients (name, company)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPlacements(data || []);
    } catch (error: any) {
      console.error("Error loading placements:", error);
      toast.error("Kon plaatsingen niet laden");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (placementId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("professional_client_matches")
        .update({ status: newStatus })
        .eq("id", placementId);

      if (error) throw error;

      toast.success("Status bijgewerkt");
      loadPlacements();
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast.error("Fout bij bijwerken status");
    }
  };

  const filteredPlacements = placements.filter(placement => {
    const matchesSearch =
      placement.professionals?.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      placement.clients?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      placement.clients?.company.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || placement.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: placements.length,
    active: placements.filter(p => p.status === "active").length,
    suggested: placements.filter(p => p.status === "suggested").length,
    completed: placements.filter(p => p.status === "completed").length
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "active": return "default";
      case "suggested": return "secondary";
      case "completed": return "outline";
      default: return "secondary";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active": return "Actief";
      case "suggested": return "Voorgesteld";
      case "completed": return "Afgerond";
      default: return status;
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6 space-y-6">
            <SidebarTrigger className="mb-4" />

            {/* Hero Section */}
            <div className="bg-gradient-to-r from-green-500/10 via-green-500/5 to-background rounded-lg p-6 border border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold mb-2">Plaatsingen</h1>
                  <p className="text-muted-foreground">
                    Beheer actieve koppelingen tussen professionals en klanten
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-600" />
              </div>
            </div>

            {/* Stats Bar */}
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{stats.total}</span>
                <span className="text-muted-foreground">totaal</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="font-medium">{stats.active}</span>
                <span className="text-muted-foreground">actief</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <span className="font-medium">{stats.suggested}</span>
                <span className="text-muted-foreground">voorgesteld</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{stats.completed}</span>
                <span className="text-muted-foreground">afgerond</span>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Zoek op professional of klant..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle statussen</SelectItem>
                  <SelectItem value="suggested">Voorgesteld</SelectItem>
                  <SelectItem value="active">Actief</SelectItem>
                  <SelectItem value="completed">Afgerond</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Placements List */}
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">
                Laden...
              </div>
            ) : filteredPlacements.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {searchQuery || statusFilter !== "all" 
                  ? "Geen plaatsingen gevonden met deze filters" 
                  : "Nog geen plaatsingen"}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredPlacements.map((placement) => (
                  <Card key={placement.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">
                                {placement.professionals?.full_name || "Onbekend"}
                              </span>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {placement.professionals?.functie_niveau}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{placement.clients?.name}</span>
                            <span className="text-sm text-muted-foreground">
                              ({placement.clients?.company})
                            </span>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="h-4 w-4" />
                              <span>
                                Aangemaakt {format(new Date(placement.created_at), "d MMM yyyy", { locale: nl })}
                              </span>
                            </div>

                            {placement.match_score && (
                              <div className="flex items-center gap-2 text-sm">
                                <TrendingUp className="h-4 w-4 text-green-600" />
                                <span>Match: {(placement.match_score * 100).toFixed(0)}%</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-3">
                          <Badge variant={getStatusVariant(placement.status)}>
                            {getStatusLabel(placement.status)}
                          </Badge>

                          <div className="flex gap-2">
                            {placement.status === "suggested" && (
                              <Button
                                size="sm"
                                onClick={() => updateStatus(placement.id, "active")}
                              >
                                Activeer
                              </Button>
                            )}
                            {placement.status === "active" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateStatus(placement.id, "completed")}
                              >
                                Afronden
                              </Button>
                            )}
                            <Button size="sm" variant="ghost">
                              Details
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
