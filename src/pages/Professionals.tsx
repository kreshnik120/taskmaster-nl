import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Plus, Search, ChevronLeft, ChevronRight, X, Users, CheckCircle, UserPlus, TrendingUp, FileWarning, LayoutGrid, List } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ProfessionalBulkActionBar } from "@/components/recruitment/ProfessionalBulkActionBar";
import { ProfessionalCard } from "@/components/recruitment/ProfessionalCard";
import { ProfessionalListView } from "@/components/recruitment/ProfessionalListView";
import { ProfessionalDetailModal } from "@/components/ProfessionalDetailModal";
import { motion } from "framer-motion";
import { useUserRole } from "@/hooks/useUserRole";
import { Badge } from "@/components/ui/badge";
import { KPICard } from "@/components/ui/kpi-card";
import { PageHero } from "@/components/ui/page-hero";
import { PageContainer } from "@/components/ui/page-container";
import { cn } from "@/lib/utils";

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
  // CV fields
  cv_file_path: string | null;
  cv_file_name: string | null;
  cv_uploaded_at: string | null;
  // Bendy sync fields
  voorletters: string | null;
  geboorteplaats: string | null;
  geslacht: string | null;
  bendy_external_id: string | null;
  bendy_id: string | null;
  org_id: string;
  // Company/Bendy fields
  iban: string | null;
  big_nummer: string | null;
  agb_code: string | null;
  skj_registratie: string | null;
  iban_tenaamstelling: string | null;
  boekhouding_email: string | null;
  bedrijfstelefoon: string | null;
  bendy_username: string | null;
  bendy_mediator_id: string | null;
  bendy_function_type: string | null;
  bendy_created_at: string | null;
  bedrijfsnaam: string | null;
  // New fields for complete data sync
  ervaring_sector: string[] | null;
  doelgroep_ervaring: string[] | null;
  certificaten: string[] | null;
  specialisaties: string[] | null;
  opleidingen: unknown;
  talen: string[] | null;
  regio_voorkeur: string[] | null;
  specifieke_doelgroepen: string[] | null;
  max_reisafstand_km: number | null;
  documents_count: number | null;
  documents_published_count: number | null;
  documents_expiring_count: number | null;
  documents_synced_at: string | null;
}

const Professionals = () => {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFunctie, setFilterFunctie] = useState<string>("all");
  const [filterWerkvorm, setFilterWerkvorm] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterRegio, setFilterRegio] = useState("");
  const [filterDocuments, setFilterDocuments] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedProfessionalIds, setSelectedProfessionalIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOption, setSortOption] = useState<string>("naam_az");
  const [linkedProfessionalIds, setLinkedProfessionalIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [viewModeManuallySet, setViewModeManuallySet] = useState(false);
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

  // Fetch professionals with active placements (excluding deleted professionals)
  const fetchLinkedProfessionals = async () => {
    const { data } = await supabase
      .from("assignments")
      .select("professional_id, professionals!inner(deleted_at)")
      .eq("status", "active")
      .is("professionals.deleted_at", null);
    
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
        .order("full_name")
        .limit(5000);

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

  const sortProfessionals = (list: typeof professionals) => {
    return [...list].sort((a, b) => {
      switch (sortOption) {
        case 'naam_za':
          return (b.full_name || '').localeCompare(a.full_name || '');
        case 'nieuwste':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oudste':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'status':
          return (a.status || '').localeCompare(b.status || '');
        case 'naam_az':
        default:
          return (a.full_name || '').localeCompare(b.full_name || '');
      }
    });
  };

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  // Smart default: list view for large datasets
  useEffect(() => {
    if (!viewModeManuallySet && professionals.length > 100) {
      setViewMode('list');
    }
  }, [professionals.length, viewModeManuallySet]);

  const filteredProfessionals = sortProfessionals(professionals.filter((p) => {
    const term = debouncedSearchTerm.toLowerCase();
    const matchesSearch = !term ||
      p.full_name.toLowerCase().includes(term) ||
      (p.email?.toLowerCase().includes(term) ?? false) ||
      (p.telefoonnummer?.includes(term) ?? false) ||
      (p.regio?.toLowerCase().includes(term) ?? false);
    const matchesFunctie = filterFunctie === "all" || p.functie_niveau === filterFunctie;
    const matchesWerkvorm = filterWerkvorm === "all" || p.werkvorm === filterWerkvorm;
    const matchesStatus = filterStatus === "all" || p.status === filterStatus;
    const matchesRegio = !filterRegio || (p.regio?.toLowerCase().includes(filterRegio.toLowerCase()) ?? false);
    const matchesDocs = filterDocuments === "all" ||
      (filterDocuments === "verlopen" && p.documents_expiring_count && p.documents_expiring_count > 0) ||
      (filterDocuments === "ok" && p.documents_published_count && p.documents_published_count > 0 && (!p.documents_expiring_count || p.documents_expiring_count === 0)) ||
      (filterDocuments === "geen" && (!p.documents_count || p.documents_count === 0));
    const matchesNieuw = activeKpi !== "nieuw" || (Math.floor((new Date().getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24)) <= 7);
    return matchesSearch && matchesFunctie && matchesWerkvorm && matchesStatus && matchesRegio && matchesDocs && matchesNieuw;
  }));

  // Reset pagina naar 1 bij elke filter/zoek wijziging
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, filterFunctie, filterWerkvorm, filterStatus, filterRegio, filterDocuments, activeKpi, sortOption]);

  // Paginering berekenen
  const PAGE_SIZE = 24;
  const totalPages = Math.ceil(filteredProfessionals.length / PAGE_SIZE);
  const paginatedProfessionals = filteredProfessionals.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

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

  const docsExpiredCount = professionals.filter(p => p.documents_expiring_count && p.documents_expiring_count > 0).length;

  const hasActiveFilters = filterFunctie !== "all" || filterWerkvorm !== "all" || filterStatus !== "all" || filterRegio !== "" || filterDocuments !== "all" || sortOption !== "naam_az";

  const resetFilters = () => {
    setFilterFunctie("all");
    setFilterWerkvorm("all");
    setFilterStatus("all");
    setFilterRegio("");
    setFilterDocuments("all");
    setSortOption("naam_az");
    setCurrentPage(1);
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
    } else if (filterType === "docs_verlopen") {
      setActiveKpi(activeKpi === "docs_verlopen" ? null : "docs_verlopen");
      if (activeKpi === "docs_verlopen") {
        resetFilters();
      } else {
        setFilterDocuments("verlopen");
      }
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
    <PageContainer contextColor="rose" className="space-y-4">
      {/* Hero Section - Unified PageHero */}
      <PageHero
        title="Professionals"
        subtitle={filteredProfessionals.length !== professionals.length ? `${filteredProfessionals.length} van ${professionals.length} professionals` : `${professionals.length} professionals in je netwerk`}
        className="mb-2"
      >
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
      </PageHero>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard icon={Users} title="Totaal" value={totalCount} variant="rose" isActive={activeKpi === "all"} onClick={() => handleKpiClick("all")} />
        <KPICard icon={CheckCircle} title="Beschikbaar" value={availableCount} variant="rose" isActive={activeKpi === "beschikbaar"} onClick={() => handleKpiClick("beschikbaar")} />
        <KPICard icon={TrendingUp} title="Gekoppeld" value={withActivePlacementCount} variant="rose" onClick={() => handleKpiClick("gekoppeld")} />
        <KPICard icon={UserPlus} title="Nieuw (7d)" value={newInLast7Days} variant="rose" isActive={activeKpi === "nieuw"} onClick={() => handleKpiClick("nieuw")} />
        <KPICard icon={FileWarning} title="Doc. verlopen" value={docsExpiredCount} variant="amber" isActive={activeKpi === "docs_verlopen"} onClick={() => handleKpiClick("docs_verlopen")} />
      </div>

      {/* Sticky Filter Toolbar */}
      <div className="sticky top-0 z-30 py-2.5 bg-background/90 backdrop-blur-md border-b border-border/20 space-y-2">
        {/* Row 1: Search + Result count + View toggle */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Zoek op naam, email, telefoon of regio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-10 border-border text-sm"
            />
          </div>

          <span className="text-xs text-muted-foreground/60 whitespace-nowrap hidden sm:inline">
            {filteredProfessionals.length !== professionals.length
              ? `${filteredProfessionals.length} van ${professionals.length}`
              : `${professionals.length} professionals`}
          </span>

          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-border/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm p-0.5 gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7 w-7 p-0", viewMode === 'grid' && "bg-rose-100/60 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300")}
              onClick={() => { setViewMode('grid'); setViewModeManuallySet(true); }}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7 w-7 p-0", viewMode === 'list' && "bg-rose-100/60 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300")}
              onClick={() => { setViewMode('list'); setViewModeManuallySet(true); }}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Row 2: Filters + Sort */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Select value={filterFunctie} onValueChange={setFilterFunctie}>
            <SelectTrigger className={cn("w-auto min-w-[120px] h-8 text-xs", filterFunctie !== "all" && "border-rose-300 bg-rose-50/50 dark:border-rose-700 dark:bg-rose-950/30")}>
              <SelectValue placeholder="Functie" />
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
            <SelectTrigger className={cn("w-auto min-w-[110px] h-8 text-xs", filterWerkvorm !== "all" && "border-rose-300 bg-rose-50/50 dark:border-rose-700 dark:bg-rose-950/30")}>
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
            <SelectTrigger className={cn("w-auto min-w-[100px] h-8 text-xs", filterStatus !== "all" && "border-rose-300 bg-rose-50/50 dark:border-rose-700 dark:bg-rose-950/30")}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statussen</SelectItem>
              <SelectItem value="actief">Actief</SelectItem>
              <SelectItem value="inactief">Inactief</SelectItem>
              <SelectItem value="op_pauze">Op pauze</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterDocuments} onValueChange={setFilterDocuments}>
            <SelectTrigger className={cn("w-auto min-w-[110px] h-8 text-xs", filterDocuments !== "all" && "border-rose-300 bg-rose-50/50 dark:border-rose-700 dark:bg-rose-950/30")}>
              <SelectValue placeholder="Documenten" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle docs</SelectItem>
              <SelectItem value="verlopen">Verlopen</SelectItem>
              <SelectItem value="ok">Docs OK</SelectItem>
              <SelectItem value="geen">Geen docs</SelectItem>
            </SelectContent>
          </Select>

          {/* Visual separator between filters and sort */}
          <div className="hidden sm:block w-px h-5 bg-border/40 mx-1" />

          <Select value={sortOption} onValueChange={setSortOption}>
            <SelectTrigger className="w-auto min-w-[120px] h-8 text-xs">
              <SelectValue placeholder="Sorteer op..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="naam_az">Naam (A → Z)</SelectItem>
              <SelectItem value="naam_za">Naam (Z → A)</SelectItem>
              <SelectItem value="nieuwste">Nieuwste eerst</SelectItem>
              <SelectItem value="oudste">Oudste eerst</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" /> Reset
            </Button>
          )}
        </div>

        {/* Active filter badges */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground/50">Actief:</span>
            {filterFunctie !== "all" && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1 bg-rose-50/50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300">
                {filterFunctie} <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilterFunctie("all")} />
              </Badge>
            )}
            {filterWerkvorm !== "all" && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1 bg-rose-50/50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300">
                {filterWerkvorm} <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilterWerkvorm("all")} />
              </Badge>
            )}
            {filterStatus !== "all" && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1 bg-rose-50/50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300">
                {filterStatus} <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilterStatus("all")} />
              </Badge>
            )}
            {filterDocuments !== "all" && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1 bg-rose-50/50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300">
                {filterDocuments} <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilterDocuments("all")} />
              </Badge>
            )}
            {filterRegio && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1 bg-rose-50/50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300">
                Regio: {filterRegio} <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setFilterRegio("")} />
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Professionals Grid or List */}
      {viewMode === 'grid' ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {paginatedProfessionals.map((professional) => (
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
      ) : (
        <ProfessionalListView
          professionals={paginatedProfessionals}
          selectedIds={selectedProfessionalIds}
          onSelect={handleSelectProfessional}
          onClick={(p) => {
            setSelectedProfessional(p as any);
            setDetailModalOpen(true);
          }}
        />
      )}

      {/* Paginering */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1 py-3">
          <p className="text-sm text-muted-foreground">
            Pagina {currentPage} van {totalPages} — {filteredProfessionals.length} professionals
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Vorige
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "outline"}
                  size="sm"
                  className="min-w-[36px]"
                  onClick={() => setCurrentPage(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Volgende
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredProfessionals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 px-8 text-center rounded-xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-white/30 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="p-4 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm mb-4">
            {(hasActiveFilters || searchTerm) ? (
              <Search className="h-8 w-8 text-muted-foreground/50" />
            ) : (
              <Users className="h-8 w-8 text-muted-foreground/50" />
            )}
          </div>
          <h3 className="text-base font-medium text-foreground mb-1">
            {(hasActiveFilters || searchTerm) ? "Geen professionals gevonden" : "Nog geen professionals"}
          </h3>
          <p className="text-sm text-muted-foreground/70">
            {(hasActiveFilters || searchTerm)
              ? "Probeer andere filters of zoektermen"
              : "Voeg je eerste professional toe om te beginnen"}
          </p>
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
    </PageContainer>
  );
};

export default Professionals;
