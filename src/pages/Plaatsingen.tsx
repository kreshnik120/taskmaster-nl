import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, Users, Activity, Lightbulb, CheckCircle2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { PlacementDetailModal } from "@/components/PlacementDetailModal";
import { motion } from "framer-motion";
import { KPICard } from "@/components/ui/kpi-card";
import { PlacementEvaluationKPIs } from "@/components/recruitment/PlacementEvaluationKPIs";

interface Placement {
  id: string;
  professional_id: string;
  sublocation_id: string;
  status: string;
  werkvorm: string | null;
  plaatsing_type: string | null;
  start_date: string | null;
  end_date: string | null;
  weekly_hours: number | null;
  ai_match_score: number | null;
  ai_match_reasoning: any;
  created_at: string;
  updated_at: string;
  professionals: {
    id: string;
    full_name: string;
    functie_niveau: string;
    werkvorm: string | null;
    regio: string | null;
    telefoonnummer: string | null;
    email: string | null;
  } | null;
  client_sublocations: {
    id: string;
    naam: string;
    plaats: string | null;
    doelgroep: string[] | null;
    sector: string[] | null;
    client_locations: {
      id: string;
      naam: string;
      client_organizations: {
        id: string;
        name: string;
      } | null;
    } | null;
  } | null;
}

const WERKVORM_LABELS: Record<string, string> = {
  ZZP: "ZZP",
  Uitzendkracht: "Uitzend",
  "ABCito constructie": "ABCito"
};

const PLAATSING_TYPE_LABELS: Record<string, string> = {
  periode_opdracht: "Periode",
  langdurig: "Langdurig",
  flexibel: "Flexibel"
};

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
        .from("assignments")
        .select(`
          *,
          professionals (id, full_name, functie_niveau, werkvorm, regio, telefoonnummer, email),
          client_sublocations (
            id, naam, plaats, doelgroep, sector,
            client_locations (
              id, naam,
              client_organizations (id, name)
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPlacements((data as Placement[]) || []);
    } catch (error: any) {
      console.error("Error loading placements:", error);
      toast.error("Kon plaatsingen niet laden");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (placementId: string, newStatus: string, completedAt?: Date) => {
    try {
      const updateData: any = { status: newStatus };
      
      // Add completed_at and end_date if completing
      if (newStatus === "completed" && completedAt) {
        updateData.completed_at = completedAt.toISOString();
        updateData.end_date = completedAt.toISOString().split('T')[0];
      }

      const { error } = await supabase
        .from("assignments")
        .update(updateData)
        .eq("id", placementId);

      if (error) throw error;

      // Get professional name for success message
      const placement = placements.find(p => p.id === placementId);
      const professionalName = placement?.professionals?.full_name || "Professional";

      if (newStatus === "completed") {
        toast.success(`Plaatsing van ${professionalName} succesvol afgerond!`);
      } else {
        toast.success("Status bijgewerkt");
      }
      
      loadPlacements();
      setDetailModalOpen(false);
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast.error("Fout bij bijwerken status");
    }
  };

  const filteredPlacements = placements.filter(placement => {
    const professionalName = placement.professionals?.full_name?.toLowerCase() || "";
    const sublocationName = placement.client_sublocations?.naam?.toLowerCase() || "";
    const orgName = placement.client_sublocations?.client_locations?.client_organizations?.name?.toLowerCase() || "";
    
    const matchesSearch =
      professionalName.includes(searchQuery.toLowerCase()) ||
      sublocationName.includes(searchQuery.toLowerCase()) ||
      orgName.includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || placement.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: placements.length,
    active: placements.filter(p => p.status === "active").length,
    draft: placements.filter(p => p.status === "draft").length,
    completed: placements.filter(p => p.status === "completed").length
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active": return "Actief";
      case "draft": return "Concept";
      case "completed": return "Afgerond";
      case "cancelled": return "Geannuleerd";
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Section - Minimal */}
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Plaatsingen</h1>
        <p className="text-muted-foreground">
          {stats.active} actieve {stats.active === 1 ? 'plaatsing' : 'plaatsingen'}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          icon={Users}
          title="Totaal"
          value={stats.total}
          subtitle="plaatsingen"
          variant="count"
          onClick={() => setStatusFilter("all")}
          isActive={statusFilter === "all"}
        />
        <KPICard
          icon={Activity}
          title="Actief"
          value={stats.active}
          subtitle="lopend"
          variant="success"
          onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}
          isActive={statusFilter === "active"}
        />
        <KPICard
          icon={Lightbulb}
          title="Concept"
          value={stats.draft}
          subtitle="te activeren"
          variant="time"
          onClick={() => setStatusFilter(statusFilter === "draft" ? "all" : "draft")}
          isActive={statusFilter === "draft"}
        />
        <KPICard
          icon={CheckCircle2}
          title="Afgerond"
          value={stats.completed}
          subtitle="plaatsingen"
          variant="urgent"
          onClick={() => setStatusFilter(statusFilter === "completed" ? "all" : "completed")}
          isActive={statusFilter === "completed"}
        />
      </div>

      {/* Evaluation KPIs - Only show when there are completed placements */}
      {stats.completed > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">AI Evaluatie Inzichten</h3>
          <PlacementEvaluationKPIs />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Zoek op professional of werklocatie..."
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
            <SelectItem value="draft">Concept</SelectItem>
            <SelectItem value="active">Actief</SelectItem>
            <SelectItem value="completed">Afgerond</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Placements List - Apple Minimal Cards */}
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
        <div className="space-y-3">
          {filteredPlacements.map((placement, idx) => {
            const statusDot = placement.status === "active" ? "●" : placement.status === "draft" ? "○" : "◌";
            const sinceDate = formatDistanceToNow(new Date(placement.created_at), { locale: nl, addSuffix: false });
            const sublocation = placement.client_sublocations;
            const organization = sublocation?.client_locations?.client_organizations;
            
            return (
              <motion.div
                key={placement.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.03 }}
              >
                <Card 
                  className="hover:shadow-md transition-all duration-200 cursor-pointer border-border/50" 
                  onClick={() => {
                    setSelectedPlacement(placement);
                    setDetailModalOpen(true);
                  }}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        {/* Professional Info - Minimal */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-base">
                              {placement.professionals?.full_name || "Onbekend"}
                            </span>
                            <span className="text-muted-foreground">{statusDot}</span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {placement.professionals?.functie_niveau}
                          </div>
                        </div>

                        {/* Werklocatie Info - with Arrow */}
                        <div className="flex items-center gap-2 text-sm">
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{sublocation?.naam || "Onbekend"}</span>
                          {organization && (
                            <span className="text-muted-foreground text-xs">
                              ({organization.name})
                            </span>
                          )}
                        </div>

                        {/* Werkvorm/Type Badges + Periode */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {placement.werkvorm && (
                            <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-800">
                              {WERKVORM_LABELS[placement.werkvorm] || placement.werkvorm}
                            </Badge>
                          )}
                          {placement.plaatsing_type && (
                            <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-800">
                              {PLAATSING_TYPE_LABELS[placement.plaatsing_type] || placement.plaatsing_type}
                            </Badge>
                          )}
                          {placement.weekly_hours && (
                            <Badge variant="outline" className="text-xs">
                              {placement.weekly_hours} uur/week
                            </Badge>
                          )}
                        </div>

                        {/* Meta Info - Datums */}
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5" />
                          {placement.start_date ? (
                            <>
                              {format(new Date(placement.start_date), "d MMM yyyy", { locale: nl })}
                              {placement.end_date && (
                                <> → {format(new Date(placement.end_date), "d MMM yyyy", { locale: nl })}</>
                              )}
                            </>
                          ) : (
                            <>Sinds {sinceDate}</>
                          )}
                          {placement.ai_match_score && (
                            <> · Match {Math.round(placement.ai_match_score)}%</>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons - Subtle */}
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        {placement.status === "draft" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatus(placement.id, "active")}
                          >
                            Activeer
                          </Button>
                        )}
                        {placement.status === "active" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedPlacement(placement);
                              setDetailModalOpen(true);
                            }}
                          >
                            Afronden
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
      
      <PlacementDetailModal
        placement={selectedPlacement}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onStatusChange={updateStatus}
      />
    </div>
  );
}
