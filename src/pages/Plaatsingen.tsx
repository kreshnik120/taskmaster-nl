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
import { Search, Users, User, Building2, Calendar, TrendingUp, CheckCircle2, Clock, MapPin, Briefcase, Award } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { PlacementDetailModal } from "@/components/PlacementDetailModal";
import { motion } from "framer-motion";

interface Placement {
  id: string;
  professional_id: string;
  client_id: string;
  status: string;
  match_score: number | null;
  match_reasoning: any;
  created_at: string;
  updated_at: string;
  professionals: {
    full_name: string;
    functie_niveau: string;
    werkvorm: string | null;
    regio: string | null;
    telefoonnummer: string | null;
    email: string | null;
  };
  clients: {
    name: string;
    company: string;
    regio: string[];
    sector: string[];
  };
}

export default function Plaatsingen() {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedPlacement, setSelectedPlacement] = useState<Placement | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
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
          professionals (full_name, functie_niveau, werkvorm, regio, telefoonnummer, email),
          clients (name, company, regio, sector)
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
      setDetailModalOpen(false);
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

            {/* Clickable Stats Bar */}
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <button 
                onClick={() => setStatusFilter("all")}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors ${statusFilter === "all" ? "bg-muted" : ""}`}
              >
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{stats.total}</span>
                <span className="text-muted-foreground">totaal</span>
              </button>
              <div className="h-4 w-px bg-border" />
              <button
                onClick={() => setStatusFilter("active")}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors ${statusFilter === "active" ? "bg-muted" : ""}`}
              >
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="font-medium">{stats.active}</span>
                <span className="text-muted-foreground">actief</span>
              </button>
              <div className="h-4 w-px bg-border" />
              <button
                onClick={() => setStatusFilter("suggested")}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors ${statusFilter === "suggested" ? "bg-muted" : ""}`}
              >
                <Clock className="h-4 w-4 text-blue-600" />
                <span className="font-medium">{stats.suggested}</span>
                <span className="text-muted-foreground">voorgesteld</span>
              </button>
              <div className="h-4 w-px bg-border" />
              <button
                onClick={() => setStatusFilter("completed")}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors ${statusFilter === "completed" ? "bg-muted" : ""}`}
              >
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{stats.completed}</span>
                <span className="text-muted-foreground">afgerond</span>
              </button>
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
                {filteredPlacements.map((placement, idx) => (
                  <motion.div
                    key={placement.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.03 }}
                  >
                    <Card className="hover:shadow-lg transition-all duration-200 cursor-pointer" onClick={() => {
                      setSelectedPlacement(placement);
                      setDetailModalOpen(true);
                    }}>
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-4">
                            {/* Professional Info */}
                            <div className="flex items-start gap-4">
                              <div className="p-2 rounded-lg bg-primary/10">
                                <User className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-1">
                                  <span className="font-semibold text-lg">
                                    {placement.professionals?.full_name || "Onbekend"}
                                  </span>
                                  <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 border-blue-200">
                                    {placement.professionals?.functie_niveau}
                                  </Badge>
                                  {placement.professionals?.werkvorm && (
                                    <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200">
                                      {placement.professionals.werkvorm}
                                    </Badge>
                                  )}
                                </div>
                                {placement.professionals?.regio && (
                                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {placement.professionals.regio}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Client Info */}
                            <div className="flex items-start gap-4">
                              <div className="p-2 rounded-lg bg-green-500/10">
                                <Building2 className="h-5 w-5 text-green-600" />
                              </div>
                              <div className="flex-1">
                                <div className="mb-1">
                                  <span className="font-medium">{placement.clients?.name}</span>
                                  <span className="text-sm text-muted-foreground ml-2">
                                    ({placement.clients?.company})
                                  </span>
                                </div>
                                {placement.clients?.sector && placement.clients.sector.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {placement.clients.sector.slice(0, 3).map((s, idx) => (
                                      <Badge key={idx} variant="outline" className="text-xs bg-purple-500/10 text-purple-700 border-purple-200">
                                        {s}
                                      </Badge>
                                    ))}
                                    {placement.clients.sector.length > 3 && (
                                      <Badge variant="outline" className="text-xs">
                                        +{placement.clients.sector.length - 3}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Meta Info */}
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                <span>
                                  {format(new Date(placement.created_at), "d MMM yyyy", { locale: nl })}
                                </span>
                              </div>

                              {placement.match_score && (
                                <div className="flex items-center gap-2">
                                  <Award className="h-4 w-4 text-green-600" />
                                  <span className="font-medium text-green-600">
                                    Match: {(placement.match_score * 100).toFixed(0)}%
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-3">
                            <Badge variant={getStatusVariant(placement.status)} className="text-sm">
                              {getStatusLabel(placement.status)}
                            </Badge>

                            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
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
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
      
      <PlacementDetailModal
        placement={selectedPlacement}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onStatusChange={updateStatus}
      />
    </SidebarProvider>
  );
}
