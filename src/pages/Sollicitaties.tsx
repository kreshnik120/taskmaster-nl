import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Plus, Loader2, Search, X, Filter, RotateCcw, Undo2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import confetti from "canvas-confetti";
import { ApplicationKanbanColumn } from "@/components/ApplicationKanbanColumn";
import { ApplicationCard, ApplicationCardSkeleton } from "@/components/ApplicationCard";
import { ApplicationDetailModal } from "@/components/ApplicationDetailModal";
import { NewApplicationDialog } from "@/components/NewApplicationDialog";
import { MinimalMetricsBar } from "@/components/recruitment/MinimalMetricsBar";
import { UrgencyBanner } from "@/components/recruitment/UrgencyBanner";
import { RecentMovementsWidget } from "@/components/recruitment/RecentMovementsWidget";
import { PipelineFunnelMini } from "@/components/recruitment/PipelineFunnelMini";

interface Application {
  id: string;
  email_from: string;
  email_subject: string | null;
  email_body: string | null;
  pipeline_stage: string;
  status: string;
  completeness_score: number | null;
  missing_info: any;
  extracted_data: any;
  professional_id: string | null;
  cv_file_path: string | null;
  cv_file_name: string | null;
  created_at: string;
  updated_at: string | null;
  professionals?: {
    full_name: string;
    functie_niveau: string;
  } | null;
}

const PIPELINE_STAGES = [
  { id: "nieuw", name: "Nieuw", color: "", borderColor: "border-t-2 border-t-blue-400", countColor: "text-blue-600" },
  { id: "screening", name: "Screening", color: "", borderColor: "border-t-2 border-t-amber-400", countColor: "text-amber-600" },
  { id: "interview", name: "Interview", color: "", borderColor: "border-t-2 border-t-sky-400", countColor: "text-sky-600" },
  { id: "goedgekeurd", name: "Goedgekeurd", color: "", borderColor: "border-t-2 border-t-emerald-400", countColor: "text-emerald-600" },
  { id: "geplaatst", name: "Geplaatst", color: "", borderColor: "border-t-2 border-t-green-500", countColor: "text-green-700" },
];

const FUNCTIE_NIVEAUS = ["VIG", "HBO-V", "Verpleegkundige MBO", "Helpende", "Begeleider", "Persoonlijk begeleider", "GGZ-agoog"];
const WERKVORMEN = ["ZZP", "Uitzendkracht", "ABCito constructie"];
const ORGANISATIES = ["ABCzorg", "CitoZorg"];

const Sollicitaties = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [activeApplication, setActiveApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [newApplicationDialogOpen, setNewApplicationDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFunctieNiveau, setFilterFunctieNiveau] = useState<string>("all");
  const [filterWerkvorm, setFilterWerkvorm] = useState<string>("all");
  const [filterOrganisatie, setFilterOrganisatie] = useState<string>("all");
  const [filterRegio, setFilterRegio] = useState<string>("");
  const [lastMove, setLastMove] = useState<{ applicationId: string; fromStage: string; toStage: string } | null>(null);
  const navigate = useNavigate();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // n = New application
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        setNewApplicationDialogOpen(true);
      }
      
      // / = Focus search
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement;
        searchInput?.focus();
      }

      // Escape = Clear search / close modals
      if (e.key === 'Escape') {
        setSearchQuery('');
        setDetailModalOpen(false);
        setNewApplicationDialogOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Goedemorgen";
    if (hour < 18) return "Goedemiddag";
    return "Goedenavond";
  };

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        setUser(session.user);
        loadApplications();
      } else {
        navigate("/auth");
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
      } else {
        navigate("/auth");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  const loadApplications = async () => {
    try {
      const { data, error } = await supabase
        .from("professional_applications")
        .select(`
          *,
          professionals(full_name, functie_niveau)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setApplications(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Error loading applications:', error);
      setLoading(false);
      toast.error("Er is een fout opgetreden bij het laden van sollicitaties");
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const application = applications.find((a) => a.id === event.active.id);
    if (application) setActiveApplication(application);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveApplication(null);

    if (!over) {
      return;
    }

    const applicationId = active.id as string;
    
    // Bepaal de target kolom
    // 1. Check of over.id zelf een geldige stage is
    // 2. Zo niet, kijk naar de container waar het item in zit (bij drop op kaart)
    let targetStage = over.id as string;
    const validStageIds = PIPELINE_STAGES.map(s => s.id);
    
    if (!validStageIds.includes(targetStage)) {
      // Over.id is een kaart-ID, gebruik de container
      const containerId = over.data.current?.sortable?.containerId;
      if (containerId && validStageIds.includes(containerId)) {
        targetStage = containerId;
      } else {
        // Geen geldige drop target gevonden
        return;
      }
    }

    const newStage = targetStage;
    
    const application = applications.find((a) => a.id === applicationId);
    if (!application || application.pipeline_stage === newStage) {
      return;
    }

    const previousStage = application.pipeline_stage;

    // Map pipeline_stage to status (using valid enum values from database constraint)
    const stageToStatus: Record<string, string> = {
      nieuw: "nieuw",
      screening: "in_verwerking",
      interview: "in_gesprek",
      goedgekeurd: "klaar_voor_review",
      geplaatst: "geaccepteerd",
    };

    const newStatus = stageToStatus[newStage] || application.status;

    try {
      const { error } = await supabase
        .from("professional_applications")
        .update({ 
          pipeline_stage: newStage,
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", applicationId);

      if (error) throw error;

      setApplications((prev) =>
        prev.map((a) => (a.id === applicationId ? { ...a, pipeline_stage: newStage, status: newStatus } : a))
      );

      // Save move for undo
      setLastMove({ applicationId, fromStage: previousStage, toStage: newStage });

      const stage = PIPELINE_STAGES.find(s => s.id === newStage);
      
      // Show toast with undo option
      toast.success(`Sollicitatie verplaatst naar ${stage?.name}`, {
        action: {
          label: "Ongedaan maken",
          onClick: () => handleUndoMove(applicationId, previousStage),
        },
        duration: 5000,
      });

      // Confetti bij plaatsing
      if (newStage === "geplaatst") {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#10b981', '#34d399', '#6ee7b7'],
        });
      }

      // Automatische conversie naar professional bij plaatsing
      if (newStage === "geplaatst" && !application.professional_id && (application.completeness_score || 0) >= 80) {
        const { convertApplicationToProfessional } = await import("@/lib/convertApplicationToProfessional");
        
        const result = await convertApplicationToProfessional(application, {
          showToast: true,
          silent: false
        });

        if (result.success) {
          // Refresh applications to show the linked professional
          loadApplications();
        }
      }
    } catch (err: any) {
      console.error("Error moving application:", err);
      console.error("Error details:", {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        applicationId,
        newStage,
        newStatus
      });
      toast.error(`Fout bij verplaatsen: ${err?.message || 'Onbekende fout'}`);
    }
  };

  const handleUndoMove = async (applicationId: string, previousStage: string) => {
    try {
      const stageToStatus: Record<string, string> = {
        nieuw: "nieuw",
        screening: "in_verwerking",
        interview: "in_gesprek",
        goedgekeurd: "klaar_voor_review",
        geplaatst: "geaccepteerd",
      };

      const previousStatus = stageToStatus[previousStage];

      const { error } = await supabase
        .from("professional_applications")
        .update({ 
          pipeline_stage: previousStage,
          status: previousStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", applicationId);

      if (error) throw error;

      setApplications((prev) =>
        prev.map((a) => (a.id === applicationId ? { ...a, pipeline_stage: previousStage, status: previousStatus } : a))
      );

      const stage = PIPELINE_STAGES.find(s => s.id === previousStage);
      toast.success(`Sollicitatie teruggezet naar ${stage?.name}`);
      setLastMove(null);
    } catch (err: any) {
      console.error("Error undoing move:", err);
      toast.error(`Fout bij ongedaan maken: ${err?.message || 'Onbekende fout'}`);
    }
  };

  const getFilteredApplications = () => {
    return applications.filter((app) => {
      // Zoeken op naam of email
      const searchMatch = searchQuery === "" || 
        (app.extracted_data?.naam?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (app.email_from?.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // Filter op functieniveau
      const functieMatch = filterFunctieNiveau === "all" || 
        app.extracted_data?.functie_niveau === filterFunctieNiveau;
      
      // Filter op werkvorm
      const werkvormMatch = filterWerkvorm === "all" || 
        app.extracted_data?.werkvorm === filterWerkvorm;
      
      // Filter op organisatie
      const organisatieMatch = filterOrganisatie === "all" || 
        app.extracted_data?.assigned_organization === filterOrganisatie;
      
      // Filter op regio
      const regioMatch = filterRegio === "" || 
        (app.extracted_data?.regio?.toLowerCase().includes(filterRegio.toLowerCase()));
      
      return searchMatch && functieMatch && werkvormMatch && organisatieMatch && regioMatch;
    });
  };

  const getApplicationsForStage = (stage: string) => {
    return getFilteredApplications().filter((app) => app.pipeline_stage === stage);
  };

  const handleApplicationClick = (application: Application) => {
    setSelectedApplication(application);
    setDetailModalOpen(true);
  };

  const handleApplicationUpdated = () => {
    loadApplications();
  };

  const getStageStats = () => {
    return PIPELINE_STAGES.map(stage => ({
      ...stage,
      count: getApplicationsForStage(stage.id).length
    }));
  };

  if (loading || !user) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <main className="flex-1 p-6 overflow-auto">
            <SidebarTrigger className="mb-4" />
            <div className="flex flex-col h-full space-y-6">
              {/* Skeleton Hero Section */}
              <div className="space-y-0">
                <div className="flex items-start justify-between py-8">
                  <div>
                    <div className="h-9 w-48 bg-muted animate-pulse rounded mb-2" />
                    <div className="h-5 w-32 bg-muted animate-pulse rounded" />
                  </div>
                </div>
              </div>

              {/* Skeleton Kanban */}
              <div className="flex-1 py-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="space-y-3">
                      <div className="h-10 bg-muted animate-pulse rounded" />
                      <ApplicationCardSkeleton />
                      <ApplicationCardSkeleton />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  const filteredApplications = getFilteredApplications();
  const stageStats = getStageStats();
  const totalApplications = applications.length;
  const displayedTotal = filteredApplications.length;
  const displayedNew = filteredApplications.filter(app => app.pipeline_stage === 'nieuw').length;
  const displayedApproved = filteredApplications.filter(app => app.pipeline_stage === 'goedgekeurd').length;
  const avgCompleteness = applications.length > 0
    ? Math.round(applications.reduce((sum, app) => sum + (app.completeness_score || 0), 0) / applications.length)
    : 0;
  const displayedAvgCompleteness = filteredApplications.length > 0
    ? Math.round(filteredApplications.reduce((sum, app) => sum + (app.completeness_score || 0), 0) / filteredApplications.length)
    : 0;
  const newThisWeek = applications.filter(app => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return new Date(app.created_at) >= weekAgo;
  }).length;
  const hasActiveFilters = searchQuery || filterFunctieNiveau !== "all" || filterWerkvorm !== "all" || filterOrganisatie !== "all" || filterRegio !== "";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 p-6 overflow-auto">
          <SidebarTrigger className="mb-4" />
          <div className="flex flex-col h-full space-y-6">
            {/* Hero Section - Apple Style Minimal */}
            <div className="space-y-0">
              {/* Greeting Row */}
              <div className="flex items-start justify-between py-8">
                <div>
                  <h1 className="text-3xl font-semibold text-foreground mb-1">
                    Sollicitaties
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(), "EEEE d MMMM", { locale: nl })}
                  </p>
                </div>
                <Button onClick={() => setNewApplicationDialogOpen(true)} size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Nieuwe sollicitatie
                  <kbd className="ml-1 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-70">
                    N
                  </kbd>
                </Button>
              </div>

              {/* Minimal Metrics Bar */}
              <MinimalMetricsBar 
                totalApplications={displayedTotal}
                newApplications={displayedNew}
                approvedApplications={displayedApproved}
                avgCompleteness={displayedAvgCompleteness}
                trends={{
                  total: 2,
                  new: -1,
                  approved: 1,
                  completeness: 3,
                }}
              />

              {/* Pipeline Funnel Mini-Chart */}
              <PipelineFunnelMini applications={filteredApplications} />

              {/* Urgency Banner - Only if urgent items exist */}
              <div className="py-6">
                <UrgencyBanner applications={filteredApplications} />
              </div>

              {/* Recent Movements */}
              <RecentMovementsWidget applications={filteredApplications} />
            </div>

            {/* Search and Filter Bar - Progressive Disclosure */}
            <div className="py-8">
              <div className="flex gap-3 items-center">
                {/* Zoekbalk - Always visible */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Zoek op naam of email... (/)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 border-border/50"
                  />
                  <kbd className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    /
                  </kbd>
                </div>
                
                {/* Filters Popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="default" className="gap-2 border-border/50">
                      <Filter className="h-4 w-4" />
                      Filters
                      {(filterFunctieNiveau !== "all" || filterWerkvorm !== "all" || filterOrganisatie !== "all" || filterRegio !== "") && (
                        <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                          {[
                            filterFunctieNiveau !== "all",
                            filterWerkvorm !== "all",
                            filterOrganisatie !== "all",
                            filterRegio !== ""
                          ].filter(Boolean).length}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-96" align="end">
                    <div className="space-y-4">
                      {/* Header */}
                      <div className="flex items-center justify-between pb-3 border-b">
                        <div className="flex items-center gap-2">
                          <Filter className="h-4 w-4 text-muted-foreground" />
                          <h4 className="font-medium text-sm">Filters</h4>
                          {(filterFunctieNiveau !== "all" || filterWerkvorm !== "all" || filterOrganisatie !== "all" || filterRegio !== "") && (
                            <Badge variant="secondary" className="h-5 px-1.5">
                              {[
                                filterFunctieNiveau !== "all",
                                filterWerkvorm !== "all",
                                filterOrganisatie !== "all",
                                filterRegio !== ""
                              ].filter(Boolean).length}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-foreground mb-2 block">Functieniveau</label>
                        <Select value={filterFunctieNiveau} onValueChange={setFilterFunctieNiveau}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Alle niveaus" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Alle niveaus</SelectItem>
                            {FUNCTIE_NIVEAUS.map(niveau => (
                              <SelectItem key={niveau} value={niveau}>{niveau}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="pt-3 border-t">
                        <label className="text-sm font-medium text-foreground mb-2 block">Werkvorm</label>
                        <Select value={filterWerkvorm} onValueChange={setFilterWerkvorm}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Alle werkvormen" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Alle werkvormen</SelectItem>
                            {WERKVORMEN.map(vorm => (
                              <SelectItem key={vorm} value={vorm}>{vorm}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="pt-3 border-t">
                        <label className="text-sm font-medium text-foreground mb-2 block">Bureau</label>
                        <Select value={filterOrganisatie} onValueChange={setFilterOrganisatie}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Alle bureaus" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Alle bureaus</SelectItem>
                            {ORGANISATIES.map(org => (
                              <SelectItem key={org} value={org}>{org}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="pt-3 border-t">
                        <label className="text-sm font-medium text-foreground mb-2 block">Regio</label>
                        <Input
                          placeholder="Filter op regio..."
                          value={filterRegio}
                          onChange={(e) => setFilterRegio(e.target.value)}
                        />
                      </div>
                      
                      {/* Wis Filters Knop */}
                      {hasActiveFilters && (
                        <div className="pt-3 border-t">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setSearchQuery("");
                              setFilterFunctieNiveau("all");
                              setFilterWerkvorm("all");
                              setFilterOrganisatie("all");
                              setFilterRegio("");
                            }}
                            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Wis alle filters
                          </Button>
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              
              {/* Active Filters Indicator */}
              {hasActiveFilters && (
                <div className="text-sm text-muted-foreground mt-3">
                  {displayedTotal} van {totalApplications} sollicitaties getoond
                </div>
              )}
            </div>


            {/* Kanban Board */}
            <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="flex gap-4 overflow-x-auto pb-4">
                {PIPELINE_STAGES.map((stage) => (
                   <ApplicationKanbanColumn
                     key={stage.id}
                     id={stage.id}
                     title={stage.name}
                     applications={getApplicationsForStage(stage.id)}
                     color={stage.color}
                     borderColor={stage.borderColor}
                     countColor={stage.countColor}
                     onApplicationClick={handleApplicationClick}
                     searchQuery={searchQuery}
                   />
                ))}
              </div>

              <DragOverlay>
                {activeApplication ? (
                  <div className="rotate-2">
                    <ApplicationCard
                      application={activeApplication}
                      onClick={() => {}}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>

          {selectedApplication && (
            <ApplicationDetailModal
              application={selectedApplication}
              open={detailModalOpen}
              onOpenChange={setDetailModalOpen}
              onApplicationUpdated={handleApplicationUpdated}
            />
          )}

          <NewApplicationDialog
            open={newApplicationDialogOpen}
            onOpenChange={setNewApplicationDialogOpen}
            onApplicationCreated={handleApplicationUpdated}
          />
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Sollicitaties;
