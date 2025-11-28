import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Search, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
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
    <div className="space-y-6">
      {/* Hero Section - Minimal */}
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Plaatsingen</h1>
        <p className="text-muted-foreground">
          {stats.active} actieve {stats.active === 1 ? 'koppeling' : 'koppelingen'}
        </p>
      </div>

      {/* Stats Bar - Monochrome KPIs */}
      <div className="flex items-center gap-4 text-sm flex-wrap">
        <button 
          onClick={() => setStatusFilter("all")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors ${statusFilter === "all" ? "bg-muted" : ""}`}
        >
          <span className="font-medium">{stats.total}</span>
          <span className="text-muted-foreground">totaal</span>
        </button>
        <div className="h-4 w-px bg-border" />
        <button
          onClick={() => setStatusFilter("active")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors ${statusFilter === "active" ? "bg-muted" : ""}`}
        >
          <span className="font-medium">{stats.active}</span>
          <span className="text-muted-foreground">actief</span>
        </button>
        <div className="h-4 w-px bg-border" />
        <button
          onClick={() => setStatusFilter("suggested")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors ${statusFilter === "suggested" ? "bg-muted" : ""}`}
        >
          <span className="font-medium">{stats.suggested}</span>
          <span className="text-muted-foreground">voorgesteld</span>
        </button>
        <div className="h-4 w-px bg-border" />
        <button
          onClick={() => setStatusFilter("completed")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors ${statusFilter === "completed" ? "bg-muted" : ""}`}
        >
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
            const statusDot = placement.status === "active" ? "●" : placement.status === "suggested" ? "○" : "◌";
            const sinceDate = formatDistanceToNow(new Date(placement.created_at), { locale: nl, addSuffix: false });
            
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
                            {placement.professionals?.werkvorm && (
                              <> · {placement.professionals.werkvorm}</>
                            )}
                          </div>
                        </div>

                        {/* Client Info - Minimal with Arrow */}
                        <div className="flex items-center gap-2 text-sm">
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{placement.clients?.name}</span>
                        </div>

                        {/* Meta Info - Monochrome */}
                        <div className="text-sm text-muted-foreground">
                          Sinds {sinceDate}
                          {placement.match_score && (
                            <> · Match {(placement.match_score * 100).toFixed(0)}%</>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons - Subtle */}
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        {placement.status === "suggested" && (
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
                            onClick={() => updateStatus(placement.id, "completed")}
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
