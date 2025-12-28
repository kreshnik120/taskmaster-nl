import { useState, useEffect } from "react";
import { logger } from "@/lib/logger";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Search, X, Filter, RotateCcw, Undo2, BarChart3, Users, Inbox, CheckCircle2, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import confetti from "canvas-confetti";
import { ApplicationKanbanColumn } from "@/components/ApplicationKanbanColumn";
import { ApplicationCard, ApplicationCardSkeleton } from "@/components/ApplicationCard";
import { ApplicationDetailModal } from "@/components/ApplicationDetailModal";
import { NewApplicationDialog } from "@/components/NewApplicationDialog";
import { BulkActionBar } from "@/components/recruitment/BulkActionBar";
import { AnalyticsSheet } from "@/components/recruitment/AnalyticsSheet";
import { AIIntakeStatusWidget } from "@/components/recruitment/AIIntakeStatusWidget";
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
import { SublocationSelectionDialog } from "@/components/SublocationSelectionDialog";
import { SmartSublocationPicker } from "@/components/SmartSublocationPicker";
import { KPICard } from "@/components/ui/kpi-card";
import { useProactiveMatchNotifications } from "@/hooks/useProactiveMatchNotifications";
import { checkExistingActivePlacement } from "@/lib/checkExistingPlacement";

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
  // Document verification fields
  vog_validation_status?: string | null;
  vog_validation_source?: string | null;
  vog_issue_date?: string | null;
  vog_valid_until?: string | null;
  vog_verification_response?: any;
  diploma_validation_status?: string | null;
  diploma_validation_source?: string | null;
  professionals?: {
    full_name: string;
    functie_niveau: string;
  } | null;
}

const PIPELINE_STAGES = [
  { id: "nieuw", name: "Nieuw", color: "", borderColor: "border-t-4 border-t-recruitment-nieuw", countColor: "text-recruitment-nieuw" },
  { id: "interview", name: "Interview", color: "", borderColor: "border-t-4 border-t-recruitment-interview", countColor: "text-recruitment-interview" },
  { id: "screening", name: "Screening", color: "", borderColor: "border-t-4 border-t-recruitment-screening", countColor: "text-recruitment-screening" },
  { id: "goedgekeurd", name: "Goedgekeurd", color: "", borderColor: "border-t-4 border-t-recruitment-goedgekeurd", countColor: "text-recruitment-goedgekeurd" },
  { id: "geplaatst", name: "Geplaatst", color: "", borderColor: "border-t-4 border-t-recruitment-geplaatst", countColor: "text-recruitment-geplaatst" },
  { id: "afgewezen", name: "Afgewezen", color: "", borderColor: "border-t-4 border-t-recruitment-afgewezen", countColor: "text-recruitment-afgewezen" },
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
  const [filterStage, setFilterStage] = useState<string>("all");
  const [lastMove, setLastMove] = useState<{ applicationId: string; fromStage: string; toStage: string } | null>(null);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<Set<string>>(new Set());
  const [analyticsSheetOpen, setAnalyticsSheetOpen] = useState(false);
  const [confirmGoedgekeurdDialog, setConfirmGoedgekeurdDialog] = useState<{
    open: boolean;
    application: Application | null;
    previousStage: string;
  }>({ open: false, application: null, previousStage: '' });
  const [selectClientDialog, setSelectClientDialog] = useState<{
    open: boolean;
    application: Application | null;
    previousStage: string;
  }>({ open: false, application: null, previousStage: '' });
  const [werkvormDialog, setWerkvormDialog] = useState<{
    open: boolean;
    application: Application | null;
    previousStage: string;
    selectedWerkvorm: string;
  }>({ open: false, application: null, previousStage: '', selectedWerkvorm: '' });
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Proactive AI match notifications - shows toast when new high-match applications arrive
  useProactiveMatchNotifications((applicationId) => {
    const app = applications.find(a => a.id === applicationId);
    if (app) {
      setSelectedApplication(app);
      setDetailModalOpen(true);
    }
  });

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
          vog_validation_status,
          vog_validation_source,
          diploma_validation_status,
          diploma_validation_source,
          professionals(full_name, functie_niveau)
        `)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setApplications(data || []);
      setLoading(false);
    } catch (error) {
      logger.error('Error loading applications:', error);
      setLoading(false);
      toast.error("Er is een fout opgetreden bij het laden van sollicitaties");
    }
  };

  // Real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('applications-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'professional_applications' },
        (payload) => {
          logger.log('Realtime update:', payload);
          // Reload applications on any change
          loadApplications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-open application from URL parameter
  useEffect(() => {
    const applicationId = searchParams.get('application');
    if (applicationId && applications.length > 0 && !loading) {
      // Find the application in our data
      const targetApp = applications.find(app => app.id === applicationId);
      if (targetApp) {
        // Open the detail modal for this application
        setSelectedApplication(targetApp);
        setDetailModalOpen(true);
        
        // Clean up URL (remove query param)
        setSearchParams({});
      }
    }
  }, [searchParams, applications, loading, setSearchParams]);

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
      // Use central transition function with document validation
      const { data, error } = await supabase.rpc('transition_application_stage', {
        p_application_id: applicationId,
        p_to_stage: newStage,
        p_reason: `Kanban drag: ${previousStage} → ${newStage}`,
        p_metadata: {
          source: 'kanban_drag',
          timestamp: new Date().toISOString()
        }
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; from?: string; to?: string };

      if (!result.success) {
        // Transition was blocked (likely by document requirements)
        toast.error(result.error || 'Transitie niet toegestaan', {
          description: 'Open de sollicitatie om documenten te uploaden of verifiëren.',
          duration: 5000,
        });
        return;
      }

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

      // Special handling for "interview" - ALWAYS ask for werkvorm confirmation (even if pre-filled from CV)
      if (newStage === "interview") {
        const werkvormBevestigd = application.extracted_data?.werkvorm_bevestigd;
        if (!werkvormBevestigd) {
          // Pre-select werkvorm from CV if available
          const cvWerkvorm = application.extracted_data?.werkvorm || '';
          setWerkvormDialog({
            open: true,
            application,
            previousStage,
            selectedWerkvorm: cvWerkvorm
          });
          return; // Stop here, wait for werkvorm selection
        }
      }

      // Special handling for "goedgekeurd" - show confirmation dialog
      if (newStage === "goedgekeurd") {
        setConfirmGoedgekeurdDialog({
          open: true,
          application,
          previousStage
        });
        return; // Stop here, wait for confirmation
      }

      // Special handling for "geplaatst" - show client selection dialog
      if (newStage === "geplaatst") {
        if (!application.professional_id) {
          toast.error("Eerst professional profiel aanmaken", {
            description: "Verplaats eerst naar Goedgekeurd om een professional profiel aan te maken"
          });
          return;
        }
        
        setSelectClientDialog({
          open: true,
          application,
          previousStage
        });
        return; // Stop here, wait for client selection
      }
    } catch (err: any) {
      logger.error("Error moving application:", err);
      toast.error("Fout bij verplaatsen sollicitatie");
    }
  };

  // Handle goedgekeurd confirmation
  const handleConfirmGoedgekeurd = async () => {
    const { application, previousStage } = confirmGoedgekeurdDialog;
    if (!application) return;

    try {
      const newStage = "goedgekeurd";
      
      // Update database
      const { error: updateError } = await supabase
        .from("professional_applications")
        .update({ pipeline_stage: newStage })
        .eq("id", application.id);

      if (updateError) throw updateError;

      // Close dialog
      setConfirmGoedgekeurdDialog({ open: false, application: null, previousStage: '' });

      toast.success("Status bijgewerkt", {
        description: `Sollicitatie verplaatst naar ${newStage}`,
        duration: 5000,
      });

      // Now execute goedgekeurd flow
      // Mini confetti (groen)
      confetti({
        particleCount: 30,
        spread: 45,
        origin: { y: 0.6 },
        colors: ['#22c55e', '#16a34a', '#4ade80'],
      });

      // Automatisch professional aanmaken of data synchroniseren
      let professionalCreated = false;
      let dataSynced = false;
      let syncedFieldsCount = 0;

      if (!application.professional_id && (application.completeness_score || 0) >= 80) {
        // Nieuw profiel aanmaken
        const { convertApplicationToProfessional } = await import("@/lib/convertApplicationToProfessional");
        
        const result = await convertApplicationToProfessional(application, {
          showToast: false,
          silent: true
        });

        if (result.success) {
          professionalCreated = true;
          application.professional_id = result.professionalId;
        }
      } else if (application.professional_id) {
        // Sync data naar bestaand profiel
        const { syncApplicationToProfessional } = await import("@/lib/syncApplicationToProfessional");
        
        const syncResult = await syncApplicationToProfessional(
          application, 
          application.professional_id
        );
        
        if (syncResult.success && syncResult.fieldsUpdated > 0) {
          dataSynced = true;
          syncedFieldsCount = syncResult.fieldsUpdated;
          logger.log(`[Sync] ${syncResult.fieldsUpdated} velden gesynct:`, syncResult.fieldsSynced);
        }
      }

      // Smart toast met acties (taken worden alleen aangemaakt via Acties tab)
      const candidateName = application.extracted_data?.naam || application.email_from;
      
      let toastDescription = "Klaar voor matching. Gebruik Acties tab voor vervolgstappen.";
      if (professionalCreated) {
        toastDescription = "Professional profiel aangemaakt. Gebruik Acties tab voor vervolgstappen.";
      } else if (dataSynced) {
        toastDescription = `${syncedFieldsCount} veld${syncedFieldsCount > 1 ? 'en' : ''} bijgewerkt in professional profiel.`;
      }
      
      toast.success(`${candidateName} is goedgekeurd! 🎉`, {
        description: toastDescription,
        action: {
          label: "Bekijk Matching",
          onClick: () => {
            setSelectedApplication(application);
          },
        },
        duration: 8000,
      });

      // Refresh om nieuwe professional te tonen
      loadApplications();
    } catch (err: any) {
      console.error("Error in goedgekeurd confirmation:", err);
      toast.error(`Fout bij verwerking: ${err?.message || 'Onbekende fout'}`);
    }
  };

  // Handle goedgekeurd cancel
  const handleCancelGoedgekeurd = async () => {
    const { application, previousStage } = confirmGoedgekeurdDialog;
    if (!application) return;

    // Revert to previous stage
    try {
      const stageToStatus: Record<string, string> = {
        nieuw: "nieuw",
        screening: "in_verwerking",
        interview: "in_gesprek",
        goedgekeurd: "klaar_voor_review",
        geplaatst: "geaccepteerd",
      };

      const previousStatus = stageToStatus[previousStage];

      await supabase
        .from("professional_applications")
        .update({ 
          pipeline_stage: previousStage,
          status: previousStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", application.id);

      setConfirmGoedgekeurdDialog({ open: false, application: null, previousStage: '' });
      loadApplications();
      toast.info("Geannuleerd - sollicitatie niet verplaatst");
    } catch (err: any) {
      console.error("Error canceling:", err);
      toast.error("Fout bij annuleren");
    }
  };

  // Handle sublocation selection for "geplaatst" - writes to assignments table with ai_match_reasoning
  const handleSelectSublocation = async (sublocationId: string, sublocationName: string, sublocationData?: any) => {
    const { application } = selectClientDialog;
    if (!application || !application.professional_id) return;

    try {
      // Check for existing active placement FIRST
      const { exists } = await checkExistingActivePlacement(application.professional_id, sublocationId);
      if (exists) {
        const candidateName = application.extracted_data?.naam || application.email_from;
        toast.error(`${candidateName} is al actief geplaatst bij ${sublocationName}`, {
          description: "Een professional kan maar één actieve plaatsing per locatie hebben"
        });
        return;
      }

      // Get werkvorm from application
      const werkvorm = application.extracted_data?.werkvorm || null;

      // Build comprehensive AI match reasoning including full breakdown for transparency and AI learning
      const aiMatchReasoning = {
        calculated_at: new Date().toISOString(),
        source: 'sollicitaties_kanban',
        pipeline_stage: 'geplaatst',
        match_score: sublocationData?.matchScore || null,
        // Include full match breakdown
        ...(sublocationData?.matchBreakdown ? {
          functieMatch: sublocationData.matchBreakdown.functieMatch || 0,
          regioMatch: sublocationData.matchBreakdown.regioMatch || 0,
          sectorMatch: sublocationData.matchBreakdown.sectorMatch || 0,
          doelgroepMatch: sublocationData.matchBreakdown.doelgroepMatch || 0,
          mobiliteitMatch: sublocationData.matchBreakdown.mobiliteitMatch || 0,
          beschikbaarheidMatch: sublocationData.matchBreakdown.beschikbaarheidMatch || 0,
          werkvormMatch: sublocationData.matchBreakdown.werkvormMatch || 0,
          aiBoost: sublocationData.matchBreakdown.aiBoost || 0,
          totalScore: sublocationData.matchBreakdown.totalScore || 0,
          normalizedScore: sublocationData.matchBreakdown.normalizedScore || 0,
          hasAIBoost: sublocationData.matchBreakdown.hasAIBoost || false,
          hasTrackRecord: sublocationData.matchBreakdown.hasTrackRecord || false,
          hasExpertAdvies: sublocationData.matchBreakdown.hasExpertAdvies || false,
          details: sublocationData.matchBreakdown.details || {},
          categoryContributions: sublocationData.matchBreakdown.categoryContributions || null,
        } : {}),
        // Context data for reference
        professional_data: {
          functie_niveau: application.extracted_data?.functie_niveau,
          ervaring_sector: application.extracted_data?.ervaring_sector,
          regio: application.extracted_data?.regio,
          werkvorm: werkvorm,
          postcode: application.extracted_data?.postcode,
          doelgroep_ervaring: application.extracted_data?.doelgroep_ervaring,
        },
        sublocation_data: sublocationData ? {
          naam: sublocationData.naam,
          sector: sublocationData.sector,
          gezochte_functies: sublocationData.gezochte_functies,
          plaats: sublocationData.plaats,
          provincie: sublocationData.provincie,
        } : { naam: sublocationName },
      };

      // Create assignment with ai_match_reasoning
      const { data: assignment, error: assignmentError } = await supabase
        .from('assignments')
        .insert({
          professional_id: application.professional_id,
          sublocation_id: sublocationId,
          start_date: new Date().toISOString().split('T')[0],
          status: 'active',
          werkvorm: werkvorm,
          weekly_hours: 0,
          notes: `Geplaatst vanuit sollicitatie ${application.id}`,
          ai_match_score: sublocationData?.matchScore || null,
          ai_match_reasoning: aiMatchReasoning
        })
        .select()
        .single();

      if (assignmentError) throw assignmentError;

      // Log system event for AI learning
      const { data: { user } } = await supabase.auth.getUser();
      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user?.id)
        .limit(1)
        .maybeSingle();

      if (userOrg?.org_id) {
        await supabase.from('system_events').insert({
          org_id: userOrg.org_id,
          user_id: user?.id,
          event_type: 'placement_created',
          entity_type: 'assignment',
          entity_id: assignment.id,
          event_data: {
            application_id: application.id,
            professional_id: application.professional_id,
            sublocation_id: sublocationId,
            sublocation_name: sublocationName,
            werkvorm: werkvorm,
            ai_match_score: sublocationData?.matchScore || null,
            candidate_name: application.extracted_data?.naam || application.email_from
          },
          metadata: {
            source: 'sollicitaties_kanban',
            pipeline_stage: 'geplaatst'
          }
        });
      }

      // Close dialog
      setSelectClientDialog({ open: false, application: null, previousStage: '' });

      // Show confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#34d399', '#6ee7b7'],
      });

      const candidateName = application.extracted_data?.naam || application.email_from;
      toast.success(`${candidateName} is geplaatst bij ${sublocationName}! 🎊`, {
        description: "Plaatsing succesvol aangemaakt",
        action: {
          label: "Bekijk plaatsing",
          onClick: () => navigate("/plaatsingen")
        },
        duration: 8000,
      });

      loadApplications();
    } catch (err: any) {
      console.error("Error creating assignment:", err);
      toast.error(`Fout bij plaatsing: ${err?.message || 'Onbekende fout'}`);
    }
  };

  const handleCancelClientSelection = async () => {
    const { application, previousStage } = selectClientDialog;
    if (!application) return;

    // Revert to previous stage
    try {
      const stageToStatus: Record<string, string> = {
        nieuw: "nieuw",
        screening: "in_verwerking",
        interview: "in_gesprek",
        goedgekeurd: "klaar_voor_review",
        geplaatst: "geaccepteerd",
      };

      const previousStatus = stageToStatus[previousStage];

      await supabase
        .from("professional_applications")
        .update({ 
          pipeline_stage: previousStage,
          status: previousStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", application.id);

      setSelectClientDialog({ open: false, application: null, previousStage: '' });
      loadApplications();
      toast.info("Geannuleerd - sollicitatie niet verplaatst");
    } catch (err: any) {
      console.error("Error canceling:", err);
      toast.error("Fout bij annuleren");
    }
  };

  // Handle werkvorm selection for interview stage
  const handleConfirmWerkvorm = async () => {
    const { application, selectedWerkvorm } = werkvormDialog;
    if (!application || !selectedWerkvorm) return;

    try {
      // Update application with selected werkvorm AND mark as confirmed
      const updatedExtractedData = {
        ...(application.extracted_data || {}),
        werkvorm: selectedWerkvorm,
        werkvorm_bevestigd: true
      };

      await supabase
        .from("professional_applications")
        .update({ 
          extracted_data: updatedExtractedData,
          updated_at: new Date().toISOString()
        })
        .eq("id", application.id);

      // Close dialog and refresh
      setWerkvormDialog({ open: false, application: null, previousStage: '', selectedWerkvorm: '' });
      loadApplications();
      
      toast.success(`Werkvorm ingesteld op ${selectedWerkvorm}`, {
        description: "AI matching is nu beschikbaar via de Matches tab"
      });
    } catch (err: any) {
      console.error("Error updating werkvorm:", err);
      toast.error("Fout bij opslaan werkvorm");
    }
  };

  const handleCancelWerkvorm = async () => {
    const { application, previousStage } = werkvormDialog;
    if (!application) return;

    // Revert to previous stage
    try {
      const stageToStatus: Record<string, string> = {
        nieuw: "nieuw",
        screening: "in_verwerking",
        interview: "in_gesprek",
        goedgekeurd: "klaar_voor_review",
        geplaatst: "geaccepteerd",
      };

      const previousStatus = stageToStatus[previousStage];

      await supabase
        .from("professional_applications")
        .update({ 
          pipeline_stage: previousStage,
          status: previousStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", application.id);

      setWerkvormDialog({ open: false, application: null, previousStage: '', selectedWerkvorm: '' });
      loadApplications();
      toast.info("Geannuleerd - sollicitatie niet verplaatst");
    } catch (err: any) {
      console.error("Error canceling:", err);
      toast.error("Fout bij annuleren");
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
      
      // Filter op pipeline stage
      const stageMatch = filterStage === "all" || 
        app.pipeline_stage === filterStage;
      
      return searchMatch && functieMatch && werkvormMatch && organisatieMatch && regioMatch && stageMatch;
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

  // Synchronize selectedApplication with fresh data after applications reload
  useEffect(() => {
    if (selectedApplication && applications.length > 0) {
      const freshApp = applications.find(a => a.id === selectedApplication.id);
      if (freshApp && JSON.stringify(freshApp) !== JSON.stringify(selectedApplication)) {
        setSelectedApplication(freshApp);
      }
    }
  }, [applications, selectedApplication]);

  // Bulk actions handlers
  const handleSelectApplication = (id: string, selected: boolean) => {
    setSelectedApplicationIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedApplicationIds(new Set());
  };

  const handleBulkMove = async (toStage: string) => {
    const stageToStatus: Record<string, string> = {
      nieuw: "nieuw",
      screening: "in_verwerking",
      interview: "in_gesprek",
      goedgekeurd: "klaar_voor_review",
      geplaatst: "geaccepteerd",
    };

    const newStatus = stageToStatus[toStage];

    try {
      const { error } = await supabase
        .from("professional_applications")
        .update({ 
          pipeline_stage: toStage,
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .in("id", Array.from(selectedApplicationIds));

      if (error) throw error;

      toast.success(`${selectedApplicationIds.size} sollicitaties verplaatst`);
      setSelectedApplicationIds(new Set());
      loadApplications();
    } catch (err: any) {
      console.error("Error bulk moving:", err);
      toast.error(`Fout bij verplaatsen: ${err?.message}`);
    }
  };

  const handleBulkAssignBureau = async (bureau: string) => {
    try {
      const updates = Array.from(selectedApplicationIds).map(async (id) => {
        const app = applications.find(a => a.id === id);
        if (!app) return;

        const updatedData = {
          ...app.extracted_data,
          assigned_organization: bureau,
        };

        return supabase
          .from("professional_applications")
          .update({ extracted_data: updatedData })
          .eq("id", id);
      });

      await Promise.all(updates);

      toast.success(`${selectedApplicationIds.size} sollicitaties toegewezen aan ${bureau}`);
      setSelectedApplicationIds(new Set());
      loadApplications();
    } catch (err: any) {
      console.error("Error bulk assigning:", err);
      toast.error(`Fout bij toewijzen: ${err?.message}`);
    }
  };

  const handleBulkEmail = () => {
    const selectedEmails = applications
      .filter(app => selectedApplicationIds.has(app.id))
      .map(app => app.email_from)
      .join(';');
    
    window.location.href = `mailto:${selectedEmails}`;
    toast.success(`Email openen met ${selectedApplicationIds.size} ontvangers`);
  };

  const handleBulkDelete = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const updates = Array.from(selectedApplicationIds).map((id) => {
        return supabase
          .from("professional_applications")
          .update({ 
            deleted_at: new Date().toISOString(),
            deleted_by: user.id 
          })
          .eq("id", id);
      });

      await Promise.all(updates);

      toast.success(`${selectedApplicationIds.size} sollicitaties verwijderd`);
      setSelectedApplicationIds(new Set());
      loadApplications();
    } catch (err: any) {
      console.error("Error bulk deleting:", err);
      toast.error(`Fout bij verwijderen: ${err?.message}`);
    }
  };

  const getStageStats = () => {
    return PIPELINE_STAGES.map(stage => ({
      ...stage,
      count: getApplicationsForStage(stage.id).length
    }));
  };

  if (loading || !user) {
    return (
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
    <div className="flex flex-col h-full space-y-6">
            {/* Compact Header - Apple Minimalism */}
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-medium text-foreground">Sollicitaties</h1>
                <AIIntakeStatusWidget />
              </div>
              <div className="flex items-center gap-2">
                <AnalyticsSheet 
                  applications={filteredApplications}
                  isLoading={loading}
                  onApplicationClick={handleApplicationClick}
                  open={analyticsSheetOpen}
                  onOpenChange={setAnalyticsSheetOpen}
                />
                <Button onClick={() => setNewApplicationDialogOpen(true)} size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Nieuw
                </Button>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard
                icon={Users}
                title="Totaal"
                value={displayedTotal}
                subtitle="sollicitaties"
                variant="count"
                onClick={() => {
                  setFilterStage("all");
                  setSearchQuery("");
                  setFilterFunctieNiveau("all");
                  setFilterWerkvorm("all");
                  setFilterOrganisatie("all");
                  setFilterRegio("");
                }}
              />
          <KPICard
            icon={Inbox}
            title="Nieuw"
            value={displayedNew}
            subtitle="binnengekomen"
            variant="success"
            isActive={filterStage === "nieuw"}
            onClick={() => setFilterStage(filterStage === "nieuw" ? "all" : "nieuw")}
          />
            <KPICard
              icon={CheckCircle2}
              title="Goedgekeurd"
              value={displayedApproved}
              subtitle="klaar voor plaatsing"
              variant="time"
              isActive={filterStage === "goedgekeurd"}
              onClick={() => setFilterStage(filterStage === "goedgekeurd" ? "all" : "goedgekeurd")}
            />
              <KPICard
                icon={TrendingUp}
                title="Intake Gereed"
                value={filteredApplications.filter(app => (app.completeness_score || 0) >= 80).length}
                subtitle={`van ${displayedTotal}`}
                variant="urgent"
                onClick={() => {
                  // Filter by high completeness
                  toast.info(`${filteredApplications.filter(app => (app.completeness_score || 0) >= 80).length} sollicitaties met ≥80% compleetheid`);
                }}
              />
            </div>

            {/* Search and Filter Bar */}
            <div className="py-4">
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
                  selectedApplicationIds={selectedApplicationIds}
                  onSelectApplication={handleSelectApplication}
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

          {/* Bulk Action Bar */}
          <BulkActionBar
            selectedCount={selectedApplicationIds.size}
            onClearSelection={handleClearSelection}
            onBulkMove={handleBulkMove}
            onBulkAssignBureau={handleBulkAssignBureau}
            onBulkEmail={handleBulkEmail}
            onBulkDelete={handleBulkDelete}
          />

          {/* Goedgekeurd Confirmation Dialog */}
          <AlertDialog open={confirmGoedgekeurdDialog.open}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Professional Profiel Aanmaken?</AlertDialogTitle>
                <AlertDialogDescription>
                  Door deze kandidaat naar "Goedgekeurd" te verplaatsen wordt automatisch een professional profiel aangemaakt.
                  
                  <div className="mt-4 p-3 bg-muted rounded-md">
                    <strong>{confirmGoedgekeurdDialog.application?.extracted_data?.naam}</strong><br/>
                    <span className="text-sm text-muted-foreground">
                      {confirmGoedgekeurdDialog.application?.extracted_data?.functie_niveau} • {confirmGoedgekeurdDialog.application?.extracted_data?.werkvorm}
                    </span>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={handleCancelGoedgekeurd}>
                  Annuleren
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmGoedgekeurd}>
                  Ja, maak professional aan
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Werkvorm Selection Dialog */}
          <AlertDialog open={werkvormDialog.open}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Welke werkvorm wil de kandidaat?</AlertDialogTitle>
                <AlertDialogDescription>
                  Bepaal na het gesprek welke werkvorm de kandidaat prefereert. Dit is essentieel voor de juiste AI matching.
                  
                  <div className="mt-4 p-3 bg-muted rounded-md">
                    <strong>{werkvormDialog.application?.extracted_data?.naam}</strong><br/>
                    <span className="text-sm text-muted-foreground">
                      {werkvormDialog.application?.extracted_data?.functie_niveau}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {WERKVORMEN.map((werkvorm) => (
                      <button
                        key={werkvorm}
                        onClick={() => setWerkvormDialog(prev => ({ ...prev, selectedWerkvorm: werkvorm }))}
                        className={`w-full p-3 text-left rounded-lg border transition-all ${
                          werkvormDialog.selectedWerkvorm === werkvorm
                            ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                            : 'border-border hover:border-primary/50 hover:bg-accent/50'
                        }`}
                      >
                        <span className="font-medium">{werkvorm}</span>
                        <span className="block text-xs text-muted-foreground mt-1">
                          {werkvorm === 'ZZP' && 'Zelfstandig ondernemer - flexibele inzet'}
                          {werkvorm === 'Uitzendkracht' && 'Via uitzendbureau - vast tarief'}
                          {werkvorm === 'ABCito constructie' && 'Speciale constructie ABCzorg/CitoZorg'}
                        </span>
                      </button>
                    ))}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={handleCancelWerkvorm}>
                  Annuleren
                </AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleConfirmWerkvorm}
                  disabled={!werkvormDialog.selectedWerkvorm}
                >
                  Bevestigen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Sublocation Selection Dialog */}
          <AlertDialog open={selectClientDialog.open}>
            <AlertDialogContent className="max-w-2xl max-h-[85vh]">
              <AlertDialogHeader>
                <AlertDialogTitle>Selecteer Werklocatie voor Plaatsing</AlertDialogTitle>
                <AlertDialogDescription>
                  Kies een werklocatie om {selectClientDialog.application?.extracted_data?.naam} aan te koppelen.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <SmartSublocationPicker
                professionalId={selectClientDialog.application?.professional_id || undefined}
                professionalData={{
                  functie_niveau: selectClientDialog.application?.extracted_data?.functie_niveau,
                  werkvorm: selectClientDialog.application?.extracted_data?.werkvorm,
                  regio: selectClientDialog.application?.extracted_data?.regio,
                  postcode: selectClientDialog.application?.extracted_data?.postcode,
                  ervaring_sector: selectClientDialog.application?.extracted_data?.ervaring_sector,
                  doelgroep_ervaring: selectClientDialog.application?.extracted_data?.doelgroep_ervaring,
                }}
                onSelect={handleSelectSublocation}
                onCancel={handleCancelClientSelection}
              />
            </AlertDialogContent>
          </AlertDialog>
    </div>
  );
};

export default Sollicitaties;
