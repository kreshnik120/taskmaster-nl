import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Plus, Loader2, Mail, Search, X, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { ApplicationKanbanColumn } from "@/components/ApplicationKanbanColumn";
import { ApplicationCard } from "@/components/ApplicationCard";
import { ApplicationDetailModal } from "@/components/ApplicationDetailModal";
import { NewApplicationDialog } from "@/components/NewApplicationDialog";

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
  { id: "nieuw", name: "Nieuw", color: "bg-blue-500/10" },
  { id: "screening", name: "Screening", color: "bg-yellow-500/10" },
  { id: "interview", name: "Interview", color: "bg-purple-500/10" },
  { id: "goedgekeurd", name: "Goedgekeurd", color: "bg-green-500/10" },
  { id: "geplaatst", name: "Geplaatst", color: "bg-teal-500/10" },
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
  const navigate = useNavigate();

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
    const targetId = over.id as string;
    
    // Valideer dat targetId een geldige stage is
    const validStageIds = PIPELINE_STAGES.map(s => s.id);
    if (!validStageIds.includes(targetId)) {
      // User dropped on another card or outside valid column - ignore
      return;
    }

    const newStage = targetId;
    
    const application = applications.find((a) => a.id === applicationId);
    if (!application || application.pipeline_stage === newStage) {
      return;
    }

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

      const stage = PIPELINE_STAGES.find(s => s.id === newStage);
      toast.success(`Sollicitatie verplaatst naar ${stage?.name}`);
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
          <main className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Sollicitaties laden...</p>
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
            {/* Hero Section */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-4xl font-bold mb-2">
                    {getGreeting()}, {user?.user_metadata?.name || 'daar'}
                  </h1>
                  <p className="text-xl text-muted-foreground">
                    {format(new Date(), "EEEE d MMMM", { locale: nl })}
                  </p>
                </div>
                <Button onClick={() => setNewApplicationDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nieuwe sollicitatie
                </Button>
              </div>
              
              {/* Smart Summary */}
              <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                <p className="text-sm">
                  <Mail className="inline h-4 w-4 mr-1" />
                  Je hebt <strong>{totalApplications} sollicitaties</strong> in de pipeline
                </p>
                {newThisWeek > 0 && (
                  <p className="text-sm text-green-600">
                    ✅ <strong>{newThisWeek} nieuwe sollicitaties</strong> deze week
                  </p>
                )}
              </div>
            </div>

            {/* Zoek- en Filterbalk */}
            <div className="flex flex-wrap gap-3 items-center p-4 bg-muted/20 rounded-lg border">
              {/* Zoekbalk */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Zoek op naam of email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {/* Functieniveau Filter */}
              <Select value={filterFunctieNiveau} onValueChange={setFilterFunctieNiveau}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Functieniveau" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle niveaus</SelectItem>
                  {FUNCTIE_NIVEAUS.map(niveau => (
                    <SelectItem key={niveau} value={niveau}>{niveau}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Werkvorm Filter */}
              <Select value={filterWerkvorm} onValueChange={setFilterWerkvorm}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Werkvorm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle werkvormen</SelectItem>
                  {WERKVORMEN.map(vorm => (
                    <SelectItem key={vorm} value={vorm}>{vorm}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Organisatie Filter */}
              <Select value={filterOrganisatie} onValueChange={setFilterOrganisatie}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Organisatie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle organisaties</SelectItem>
                  {ORGANISATIES.map(org => (
                    <SelectItem key={org} value={org}>{org}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Regio Filter */}
              <div className="relative min-w-[150px]">
                <Input
                  placeholder="Filter op regio..."
                  value={filterRegio}
                  onChange={(e) => setFilterRegio(e.target.value)}
                  className="h-10"
                />
              </div>
              
              {/* Reset Filters Button */}
              {hasActiveFilters && (
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
                >
                  <X className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              )}
            </div>

            {/* Active Filters Indicator */}
            {hasActiveFilters && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <span>{displayedTotal} van {totalApplications} sollicitaties getoond</span>
              </div>
            )}

            {/* Compact Stats Bar */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-muted/30">
                <span className="text-2xl mb-1">📧</span>
                <span className="text-2xl font-bold">{hasActiveFilters ? displayedTotal : totalApplications}</span>
                <span className="text-xs text-muted-foreground">Totaal{hasActiveFilters ? ' (gefilterd)' : ''}</span>
              </div>
              
              <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-muted/30">
                <span className="text-2xl mb-1">🆕</span>
                <span className="text-2xl font-bold text-blue-600">{hasActiveFilters ? displayedNew : stageStats[0]?.count || 0}</span>
                <span className="text-xs text-muted-foreground">Nieuw</span>
              </div>
              
              <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-muted/30">
                <span className="text-2xl mb-1">✅</span>
                <span className="text-2xl font-bold text-green-600">
                  {hasActiveFilters ? displayedApproved : stageStats.find(s => s.id === 'goedgekeurd')?.count || 0}
                </span>
                <span className="text-xs text-muted-foreground">Goedgekeurd</span>
              </div>
              
              <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-muted/30">
                <span className="text-2xl mb-1">📊</span>
                <span className="text-2xl font-bold">{hasActiveFilters ? displayedAvgCompleteness : avgCompleteness}%</span>
                <span className="text-xs text-muted-foreground">Gemiddelde compleetheid</span>
              </div>
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
                    onApplicationClick={handleApplicationClick}
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
