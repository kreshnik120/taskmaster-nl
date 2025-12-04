import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useCountUp } from "@/hooks/useCountUp";
import { useNavigate } from "react-router-dom";
import { Plus, Search, ChevronDown, X, Users, CheckCircle, UserPlus, TrendingUp } from "lucide-react";
import { ProfessionalBulkActionBar } from "@/components/recruitment/ProfessionalBulkActionBar";
import { ProfessionalCard } from "@/components/recruitment/ProfessionalCard";
import { motion } from "framer-motion";
import { useUserRole } from "@/hooks/useUserRole";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { KPICard } from "@/components/ui/kpi-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProfessionalDetailModal } from "@/components/ProfessionalDetailModal";

interface Professional {
  id: string;
  full_name: string;
  functie_niveau: string;
  regio: string | null;
  woonplaats: string | null;
  postcode: string | null;
  adres: string | null;
  geboortedatum: string | null;
  profile_photo_url: string | null;
  skills: string[];
  status: string;
  rating: number | null;
  tags: string[];
  werkvorm: string | null;
  telefoonnummer: string | null;
  email: string | null;
  heeft_auto: boolean | null;
  heeft_rijbewijs: boolean | null;
  beschikbaarheidsnotities: string | null;
  gewenst_uurloon: number | null;
  cao_akkoord: boolean | null;
  kvk_nummer: string | null;
  btw_nummer: string | null;
  created_at: string;
  updated_at: string;
}

const Professionals = () => {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFunctie, setFilterFunctie] = useState<string>("all");
  const [filterWerkvorm, setFilterWerkvorm] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterRegio, setFilterRegio] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedProfessionalIds, setSelectedProfessionalIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const [linkedProfessionalIds, setLinkedProfessionalIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { canEdit } = useUserRole();
  const navigate = useNavigate();

  const [newProfessional, setNewProfessional] = useState({
    full_name: "",
    functie_niveau: "VIG",
    regio: "",
    skills: "",
    rating: "",
    email: "",
    telefoonnummer: "",
  });

  // Fetch professionals with active placements
  const fetchLinkedProfessionals = async () => {
    const { data } = await supabase
      .from("assignments")
      .select("professional_id")
      .eq("status", "active");
    
    const uniqueIds = new Set(data?.map(a => a.professional_id) || []);
    setLinkedProfessionalIds(uniqueIds);
  };

  useEffect(() => {
    fetchProfessionals();
    fetchLinkedProfessionals();

    // Real-time subscription for professionals
    const professionalsChannel = supabase
      .channel('professionals-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'professionals',
        },
        () => fetchProfessionals()
      )
      .subscribe();

    // Real-time subscription for assignments (to update Gekoppeld KPI)
    const assignmentsChannel = supabase
      .channel('assignments-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assignments',
        },
        () => fetchLinkedProfessionals()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(professionalsChannel);
      supabase.removeChannel(assignmentsChannel);
    };
  }, []);

  const fetchProfessionals = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Cross-bureau: ABCzorg en CitoZorg werken samen
      // Haal alle professionals op voor beide bureaus
      const { data, error } = await supabase
        .from("professionals")
        .select("*")
        .is("deleted_at", null)
        .order("full_name");

      if (error) throw error;
      setProfessionals(data || []);
    } catch (error) {
      console.error("Error fetching professionals:", error);
      toast({
        title: "Fout bij laden",
        description: "Kan professionals niet laden",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddProfessional = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userOrg } = await supabase
        .from("user_organizations")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (!userOrg) return;

      const { error } = await supabase.from("professionals").insert({
        org_id: userOrg.org_id,
        full_name: newProfessional.full_name,
        functie_niveau: newProfessional.functie_niveau,
        regio: newProfessional.regio || null,
        skills: newProfessional.skills ? newProfessional.skills.split(",").map(s => s.trim()) : [],
        rating: newProfessional.rating ? parseFloat(newProfessional.rating) : null,
        status: "actief",
      });

      if (error) throw error;

      toast({
        title: "Toegevoegd",
        description: "Professional succesvol toegevoegd",
      });

      setIsAddDialogOpen(false);
      setNewProfessional({
        full_name: "",
        functie_niveau: "VIG",
        regio: "",
        skills: "",
        rating: "",
        email: "",
        telefoonnummer: "",
      });
      fetchProfessionals();
    } catch (error) {
      console.error("Error adding professional:", error);
      toast({
        title: "Fout",
        description: "Kan professional niet toevoegen",
        variant: "destructive",
      });
    }
  };

  const filteredProfessionals = professionals.filter((p) => {
    const matchesSearch = p.full_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFunctie = filterFunctie === "all" || p.functie_niveau === filterFunctie;
    const matchesWerkvorm = filterWerkvorm === "all" || p.werkvorm === filterWerkvorm;
    const matchesStatus = filterStatus === "all" || p.status === filterStatus;
    const matchesRegio = !filterRegio || (p.regio?.toLowerCase().includes(filterRegio.toLowerCase()) ?? false);
    return matchesSearch && matchesFunctie && matchesWerkvorm && matchesStatus && matchesRegio;
  });

  // Bulk action handlers
  const handleSelectProfessional = (id: string, checked: boolean) => {
    const newSelection = new Set(selectedProfessionalIds);
    if (checked) {
      newSelection.add(id);
    } else {
      newSelection.delete(id);
    }
    setSelectedProfessionalIds(newSelection);
  };

  const handleClearSelection = () => {
    setSelectedProfessionalIds(new Set());
  };

  const handleBulkChangeStatus = async (status: string) => {
    try {
      const ids = Array.from(selectedProfessionalIds);
      const { error } = await supabase
        .from("professionals")
        .update({ status })
        .in("id", ids);

      if (error) throw error;

      toast({
        title: "Status bijgewerkt",
        description: `${ids.length} professional(s) status gewijzigd naar ${status}`,
      });
      
      handleClearSelection();
      fetchProfessionals();
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Fout",
        description: "Kan status niet bijwerken",
        variant: "destructive",
      });
    }
  };

  const handleBulkEmail = () => {
    const emails = professionals
      .filter(p => selectedProfessionalIds.has(p.id) && p.email)
      .map(p => p.email)
      .join(",");
    
    if (emails) {
      window.location.href = `mailto:${emails}`;
    } else {
      toast({
        title: "Geen emails",
        description: "Geselecteerde professionals hebben geen email adres",
        variant: "destructive",
      });
    }
  };

  const handleBulkExport = () => {
    const selectedProfs = professionals.filter(p => selectedProfessionalIds.has(p.id));
    const csv = [
      ["Naam", "Functie", "Werkvorm", "Regio", "Email", "Telefoon", "Status"].join(","),
      ...selectedProfs.map(p => [
        p.full_name,
        p.functie_niveau,
        p.werkvorm || "",
        p.regio || "",
        p.email || "",
        p.telefoonnummer || "",
        p.status
      ].join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `professionals-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    toast({
      title: "Geëxporteerd",
      description: `${selectedProfs.length} professional(s) geëxporteerd naar CSV`,
    });
  };

  const handleBulkDelete = async () => {
    if (selectedProfessionalIds.size === 0) return;
    
    const ids = Array.from(selectedProfessionalIds);
    
    try {
      // Soft delete - set deleted_at timestamp
      const { error } = await supabase
        .from("professionals")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);

      if (error) throw error;

      toast({
        title: "Verwijderd",
        description: `${ids.length} professional(s) verwijderd`,
      });
      
      handleClearSelection();
      setDeleteConfirmOpen(false);
      fetchProfessionals();
    } catch (error) {
      console.error("Error deleting professionals:", error);
      toast({
        title: "Fout",
        description: "Kan professionals niet verwijderen",
        variant: "destructive",
      });
    }
  };

  // KPI metrics
  const totalCount = professionals.length;
  const activeCount = professionals.filter(p => p.status === "actief").length;
  const withActivePlacementCount = linkedProfessionalIds.size;
  const availableCount = activeCount - withActivePlacementCount;
  
  const newInLast7Days = professionals.filter(p => {
    const daysSinceCreated = Math.floor((new Date().getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceCreated <= 7;
  }).length;

  const hasActiveFilters = filterFunctie !== "all" || filterWerkvorm !== "all" || filterStatus !== "all" || filterRegio !== "";

  const resetFilters = () => {
    setFilterFunctie("all");
    setFilterWerkvorm("all");
    setFilterStatus("all");
    setFilterRegio("");
  };

  const handleKpiClick = (filterType: string) => {
    if (filterType === "all") {
      setActiveKpi(null);
      resetFilters();
    } else if (filterType === "beschikbaar") {
      setActiveKpi(activeKpi === "beschikbaar" ? null : "beschikbaar");
      if (activeKpi === "beschikbaar") {
        resetFilters();
      } else {
        setFilterStatus("actief");
      }
    } else if (filterType === "nieuw") {
      setActiveKpi(activeKpi === "nieuw" ? null : "nieuw");
      if (activeKpi === "nieuw") {
        resetFilters();
      }
    } else if (filterType === "gekoppeld") {
      navigate("/plaatsingen");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Laden...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section - Minimal */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Professionals</h1>
            <p className="text-muted-foreground">
              {professionals.length} professionals in je netwerk
            </p>
          </div>
          {canEdit() && (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Toevoegen
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nieuwe Professional</DialogTitle>
                  <DialogDescription>
                    Voeg een nieuwe professional toe aan het systeem
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="full_name">Volledige naam *</Label>
                    <Input
                      id="full_name"
                      value={newProfessional.full_name}
                      onChange={(e) =>
                        setNewProfessional({ ...newProfessional, full_name: e.target.value })
                      }
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="functie_niveau">Functieniveau *</Label>
                    <Select
                      value={newProfessional.functie_niveau}
                      onValueChange={(value) =>
                        setNewProfessional({ ...newProfessional, functie_niveau: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecteer functieniveau" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VIG">VIG</SelectItem>
                        <SelectItem value="HBO-V">HBO-V</SelectItem>
                        <SelectItem value="Verpleegkundige MBO">Verpleegkundige MBO</SelectItem>
                        <SelectItem value="Helpende">Helpende</SelectItem>
                        <SelectItem value="Begeleider">Begeleider</SelectItem>
                        <SelectItem value="Persoonlijk begeleider">Persoonlijk begeleider</SelectItem>
                        <SelectItem value="GGZ-agoog">GGZ-agoog</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newProfessional.email}
                        onChange={(e) =>
                          setNewProfessional({ ...newProfessional, email: e.target.value })
                        }
                        placeholder="professional@example.com"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="telefoonnummer">Telefoonnummer</Label>
                      <Input
                        id="telefoonnummer"
                        value={newProfessional.telefoonnummer}
                        onChange={(e) =>
                          setNewProfessional({ ...newProfessional, telefoonnummer: e.target.value })
                        }
                        placeholder="+31612345678"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="regio">Regio</Label>
                    <Input
                      id="regio"
                      value={newProfessional.regio}
                      onChange={(e) =>
                        setNewProfessional({ ...newProfessional, regio: e.target.value })
                      }
                      placeholder="Amsterdam"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="skills">Vaardigheden (kommagescheiden)</Label>
                    <Input
                      id="skills"
                      value={newProfessional.skills}
                      onChange={(e) =>
                        setNewProfessional({ ...newProfessional, skills: e.target.value })
                      }
                      placeholder="Wondverzorging, Medicatie, ..."
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Annuleren
                  </Button>
                  <Button onClick={handleAddProfessional}>Toevoegen</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* KPI Cards met Icons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          icon={Users}
          title="Totaal"
          value={totalCount}
          variant="count"
          isActive={activeKpi === "all"}
          onClick={() => handleKpiClick("all")}
        />
        <KPICard
          icon={CheckCircle}
          title="Beschikbaar"
          value={availableCount}
          variant="success"
          isActive={activeKpi === "beschikbaar"}
          onClick={() => handleKpiClick("beschikbaar")}
        />
            <KPICard
              icon={TrendingUp}
              title="Gekoppeld"
              value={withActivePlacementCount}
              variant="time"
              onClick={() => handleKpiClick("gekoppeld")}
            />
        <KPICard
          icon={UserPlus}
          title="Nieuw (7d)"
          value={newInLast7Days}
          variant="personal"
          isActive={activeKpi === "nieuw"}
          onClick={() => handleKpiClick("nieuw")}
        />
      </div>

      {/* Filter Bar - Inline */}
      <div className="flex items-center gap-3 relative">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Zoek op naam..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-9 border-border"
          />
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <span className="text-sm">Filters</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="absolute right-0 mt-2 z-10">
            <Card className="w-[400px] p-4 shadow-lg">
              <div className="space-y-3">
                <Select value={filterFunctie} onValueChange={setFilterFunctie}>
                  <SelectTrigger>
                    <SelectValue placeholder="Functieniveau" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle functies</SelectItem>
                    <SelectItem value="VIG">VIG</SelectItem>
                    <SelectItem value="HBO-V">HBO-V</SelectItem>
                    <SelectItem value="Verpleegkundige MBO">Verpleegkundige MBO</SelectItem>
                    <SelectItem value="Helpende">Helpende</SelectItem>
                    <SelectItem value="Begeleider">Begeleider</SelectItem>
                    <SelectItem value="Persoonlijk begeleider">Persoonlijk begeleider</SelectItem>
                    <SelectItem value="GGZ-agoog">GGZ-agoog</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterWerkvorm} onValueChange={setFilterWerkvorm}>
                  <SelectTrigger>
                    <SelectValue placeholder="Werkvorm" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle werkvormen</SelectItem>
                    <SelectItem value="ZZP">ZZP</SelectItem>
                    <SelectItem value="Uitzendkracht">Uitzendkracht</SelectItem>
                    <SelectItem value="ABCito constructie">ABCito constructie</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle statussen</SelectItem>
                    <SelectItem value="actief">Actief</SelectItem>
                    <SelectItem value="inactief">Inactief</SelectItem>
                    <SelectItem value="op_pauze">Op pauze</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  type="text"
                  placeholder="Filter op regio..."
                  value={filterRegio}
                  onChange={(e) => setFilterRegio(e.target.value)}
                />
              </div>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Reset
          </Button>
        )}
      </div>

      {/* Active Filter Indicator */}
      {hasActiveFilters && (
        <div className="text-sm text-muted-foreground">
          {filteredProfessionals.length} van {professionals.length} professionals
        </div>
      )}

      {/* Professionals Grid - Minimal Cards */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filteredProfessionals.map((professional) => (
          <motion.div
            key={professional.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            <ProfessionalCard
              professional={professional}
              isSelected={selectedProfessionalIds.has(professional.id)}
              onSelect={handleSelectProfessional}
              onClick={() => {
                setSelectedProfessional(professional);
                setDetailModalOpen(true);
              }}
            />
          </motion.div>
        ))}
      </div>

      {/* Empty State */}
      {filteredProfessionals.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Geen professionals gevonden</p>
        </div>
      )}

      {/* Detail Modal */}
      <ProfessionalDetailModal
        professional={selectedProfessional}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onSuccess={fetchProfessionals}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Professionals verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je {selectedProfessionalIds.size} professional(s) wilt verwijderen? 
              Ze kunnen later worden hersteld via het archief.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Action Bar */}
      <ProfessionalBulkActionBar
        selectedCount={selectedProfessionalIds.size}
        onClearSelection={handleClearSelection}
        onBulkChangeStatus={handleBulkChangeStatus}
        onBulkEmail={handleBulkEmail}
        onBulkExport={handleBulkExport}
        onBulkDelete={() => setDeleteConfirmOpen(true)}
      />
    </div>
  );
};

export default Professionals;
