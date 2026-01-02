import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Mail, User, FileText, Calendar, AlertCircle, CheckCircle2, Clock, Phone, CalendarClock, ClipboardCheck, Plus, ExternalLink, Loader2, X, Upload, Download, Eye, Trash2, Building2, UserPlus, ChevronDown, ChevronUp, Sparkles, MapPin, Cake, ZoomIn, Briefcase } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
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
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { convertApplicationToProfessional } from "@/lib/convertApplicationToProfessional";
import { resolveApplicationName } from "@/lib/utils";
import { ApplicationActivityTimeline } from "@/components/recruitment/ApplicationActivityTimeline";
import { EmailTemplateSuggestions } from "@/components/recruitment/EmailTemplateSuggestions";
import { ApplicationNotes } from "@/components/recruitment/ApplicationNotes";
import { InterviewSchedulingModal } from "@/components/recruitment/InterviewSchedulingModal";
import { ApplicationMatchesTab } from "@/components/recruitment/ApplicationMatchesTab";
import { AIFollowupButton } from "@/components/recruitment/AIFollowupButton";
import { DocumentVerificationStatus } from "@/components/recruitment/DocumentVerificationStatus";
import { DocumentUploadSection } from "@/components/recruitment/DocumentUploadSection";
import { ZZPDocumentUploadSection } from "@/components/recruitment/ZZPDocumentUploadSection";
import { StageTransitionButton } from "@/components/recruitment/StageTransitionButton";
import { WerkvormDetectionBanner } from "@/components/recruitment/WerkvormDetectionBanner";
import { DiplomaVerificationBanner } from "@/components/recruitment/DiplomaVerificationBanner";
import { DiplomaLevelMismatchAlert } from "@/components/recruitment/DiplomaLevelMismatchAlert";

interface Application {
  id: string;
  org_id?: string; // Added for AI agent orchestration
  email?: string | null; // Extracted email if different from email_from
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
  documents_verified_by?: string | null;
  documents_verified_at?: string | null;
  professionals?: {
    full_name: string;
    functie_niveau: string;
  } | null;
}

interface ApplicationDetailModalProps {
  application: Application;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplicationUpdated: () => void;
}

interface LinkedTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  recruitment_action_type: string | null;
  assignee_id: string | null;
  profiles: {
    name: string | null;
  } | null;
}

// Semantic color mapping
const getSectorColor = (sector: string) => {
  const colors: Record<string, string> = {
    "VVT": "bg-blue-100 text-blue-700 border-blue-300",
    "GGZ": "bg-purple-100 text-purple-700 border-purple-300",
    "GHZ": "bg-green-100 text-green-700 border-green-300",
    "Jeugdzorg": "bg-orange-100 text-orange-700 border-orange-300",
    "Ziekenhuis/Klinisch": "bg-red-100 text-red-700 border-red-300",
    "Thuiszorg": "bg-teal-100 text-teal-700 border-teal-300",
  };
  return colors[sector] || "bg-muted text-foreground";
};

const getDoelgroepColor = (doelgroep: string) => {
  const colors: Record<string, string> = {
    "Ouderen": "bg-amber-100 text-amber-700 border-amber-300",
    "LVB": "bg-emerald-100 text-emerald-700 border-emerald-300",
    "Psychiatrie": "bg-indigo-100 text-indigo-700 border-indigo-300",
    "Somatiek": "bg-rose-100 text-rose-700 border-rose-300",
    "Kinderen/Jeugd": "bg-cyan-100 text-cyan-700 border-cyan-300",
    "Verslaving": "bg-slate-100 text-slate-700 border-slate-300",
  };
  return colors[doelgroep] || "bg-muted text-foreground";
};

const getFunctieColor = (functie: string) => {
  const colors: Record<string, string> = {
    "VIG": "bg-blue-100 text-blue-700 border-blue-300",
    "HBO-V": "bg-purple-100 text-purple-700 border-purple-300",
    "Verpleegkundige MBO": "bg-green-100 text-green-700 border-green-300",
    "Helpende": "bg-orange-100 text-orange-700 border-orange-300",
    "Begeleider": "bg-cyan-100 text-cyan-700 border-cyan-300",
    "Persoonlijk begeleider": "bg-pink-100 text-pink-700 border-pink-300",
    "GGZ-agoog": "bg-indigo-100 text-indigo-700 border-indigo-300",
  };
  return colors[functie] || "bg-muted text-foreground";
};

// === Helper functions for per-field confidence (backwards compatible) ===

// Get the value from a field (supports both old flat format and new {value, confidence} format)
const getFieldValue = <T,>(field: T | { value: T; confidence: number } | null | undefined): T | null => {
  if (field === null || field === undefined) return null;
  if (typeof field === 'object' && field !== null && 'value' in field) {
    return (field as { value: T; confidence: number }).value;
  }
  return field as T;
};

// Get the confidence from a field (supports both formats, with fallback to global)
const getFieldConfidence = (field: any, fallbackGlobal?: number): number | undefined => {
  if (field === null || field === undefined) return fallbackGlobal;
  if (typeof field === 'object' && 'confidence' in field) {
    return field.confidence;
  }
  return fallbackGlobal; // Old format: use global confidence
};

// Check if extracted_data uses new per-field confidence format
const hasPerFieldConfidence = (extractedData: any): boolean => {
  if (!extractedData) return false;
  // Check if any field has the new {value, confidence} structure
  return extractedData.naam && typeof extractedData.naam === 'object' && 'confidence' in extractedData.naam;
};

// Confidence Badge Component for AI extraction transparency
const ConfidenceBadge = ({ 
  confidence, 
  field,
  fallbackGlobal 
}: { 
  confidence?: number; 
  field?: any;
  fallbackGlobal?: number;
}) => {
  // Get confidence from field if provided, otherwise use confidence prop or fallback
  const effectiveConfidence = field !== undefined 
    ? getFieldConfidence(field, fallbackGlobal) 
    : (confidence ?? fallbackGlobal);
  
  if (effectiveConfidence === undefined || effectiveConfidence === null) return null;
  
  if (effectiveConfidence >= 0.8) {
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-green-100 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300">
        ✓ {Math.round(effectiveConfidence * 100)}%
      </Badge>
    );
  }
  if (effectiveConfidence >= 0.5) {
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300">
        ~ {Math.round(effectiveConfidence * 100)}%
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300">
      ? {Math.round(effectiveConfidence * 100)}%
    </Badge>
  );
};

export function ApplicationDetailModal({
  application,
  open,
  onOpenChange,
  onApplicationUpdated,
}: ApplicationDetailModalProps) {
  // Smart candidate name resolution with fallbacks
  const candidateName = resolveApplicationName(application);
  
  const [updating, setUpdating] = useState(false);
  const [linkedTasks, setLinkedTasks] = useState<LinkedTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  
  // Get photo URL for lightbox
  const photoUrl = getFieldValue(application.extracted_data?.profile_photo_url) as string | null;
  
  // Collapsible sections (localStorage persistence)
  const [contactOpen, setContactOpen] = useState(() => {
    const saved = localStorage.getItem('app-modal-contact-open');
    return saved ? JSON.parse(saved) : true;
  });
  const [extractedOpen, setExtractedOpen] = useState(() => {
    const saved = localStorage.getItem('app-modal-extracted-open');
    return saved ? JSON.parse(saved) : false;
  });
  const [actionsOpen, setActionsOpen] = useState(() => {
    const saved = localStorage.getItem('app-modal-actions-open');
    return saved ? JSON.parse(saved) : true;
  });
  
  // Save to localStorage when changed
  useEffect(() => {
    localStorage.setItem('app-modal-contact-open', JSON.stringify(contactOpen));
  }, [contactOpen]);
  
  useEffect(() => {
    localStorage.setItem('app-modal-extracted-open', JSON.stringify(extractedOpen));
  }, [extractedOpen]);
  
  useEffect(() => {
    localStorage.setItem('app-modal-actions-open', JSON.stringify(actionsOpen));
  }, [actionsOpen]);
  
  // Action creation form
  const [showActionForm, setShowActionForm] = useState(false);
  const [actionType, setActionType] = useState<string>("call");
  const [customTitle, setCustomTitle] = useState("");
  const [actionPriority, setActionPriority] = useState("MEDIUM");
  const [actionNotes, setActionNotes] = useState("");
  const [actionDueDate, setActionDueDate] = useState<Date | undefined>(undefined);
  const [actionDueTime, setActionDueTime] = useState<string>("09:00");
  const [creatingAction, setCreatingAction] = useState(false);
  
  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    telefoon: "",
    regio: "",
    functie_niveau: "",
    werkvorm: "",
    beschikbaarheid: "",
    ervaring_sector: [] as string[],
    doelgroep_ervaring: [] as string[],
    eigen_vervoer: null as boolean | null, // null = onbekend
    bron: "",
    opmerkingen: "",
    assigned_organization: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  
  // Convert to professional
  const [convertingToProfessional, setConvertingToProfessional] = useState(false);
  
  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Interview scheduling modal
  const [interviewModalOpen, setInterviewModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load linked tasks
  useEffect(() => {
    if (application?.id && open) {
      loadLinkedTasks();
    }
  }, [application?.id, open]);

  // Initialize edit data
  useEffect(() => {
    if (application && editMode) {
      setEditData({
        telefoon: getFieldValue(application.extracted_data?.telefoon) || "",
        regio: getFieldValue(application.extracted_data?.regio) || "",
        functie_niveau: getFieldValue(application.extracted_data?.functie_niveau) || "",
        werkvorm: getFieldValue(application.extracted_data?.werkvorm) || "",
        beschikbaarheid: getFieldValue(application.extracted_data?.beschikbaarheid) || "",
        ervaring_sector: getFieldValue(application.extracted_data?.ervaring_sector) || [],
        doelgroep_ervaring: getFieldValue(application.extracted_data?.doelgroep_ervaring) || [],
        eigen_vervoer: getFieldValue(application.extracted_data?.eigen_vervoer) ?? null, // preserve null state
        bron: getFieldValue(application.extracted_data?.bron) || "",
        opmerkingen: getFieldValue(application.extracted_data?.opmerkingen) || "",
        assigned_organization: getFieldValue(application.extracted_data?.assigned_organization) || "",
      });
    }
  }, [application, editMode]);

  const loadLinkedTasks = async () => {
    if (!application?.id) return;
    
    setLoadingTasks(true);
    try {
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('id, title, status, priority, due_at, recruitment_action_type, assignee_id')
        .eq('application_id', application.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;

      const assigneeIds = tasksData?.map(t => t.assignee_id).filter(Boolean) || [];
      let profilesMap = new Map();

      if (assigneeIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', assigneeIds);

        profilesData?.forEach(p => profilesMap.set(p.id, p));
      }

      const mappedTasks: LinkedTask[] = (tasksData || []).map(task => ({
        ...task,
        profiles: task.assignee_id && profilesMap.has(task.assignee_id)
          ? { name: profilesMap.get(task.assignee_id).name }
          : null
      }));

      setLinkedTasks(mappedTasks);
    } catch (error) {
      logger.error('Error loading linked tasks:', error);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleStageChange = async (newStage: string) => {
    setUpdating(true);
    try {
      const stageToStatus: Record<string, string> = {
        nieuw: "nieuw",
        screening: "in_verwerking",
        interview: "in_gesprek",
        goedgekeurd: "klaar_voor_review",
        geplaatst: "geaccepteerd",
      };
      const newStatus = stageToStatus[newStage] || "nieuw";

      const { error } = await supabase
        .from("professional_applications")
        .update({ 
          pipeline_stage: newStage,
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", application.id);

      if (error) throw error;

      toast.success("Pipeline fase bijgewerkt");
      onApplicationUpdated();
    } catch (error) {
      logger.error("Error updating stage:", error);
      toast.error("Fout bij bijwerken van fase");
    } finally {
      setUpdating(false);
    }
  };

  const getStageLabel = (stage: string) => {
    const labels: Record<string, string> = {
      nieuw: "Nieuw",
      screening: "Screening",
      interview: "Interview",
      goedgekeurd: "Goedgekeurd",
      geplaatst: "Geplaatst",
      afgewezen: "Afgewezen",
    };
    return labels[stage] || stage;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      nieuw: "Nieuw",
      in_behandeling: "In behandeling",
      wacht_op_info: "Wacht op info",
      compleet: "Compleet",
      afgerond: "Afgerond",
    };
    return labels[status] || status;
  };

  const getActionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      call: "Bel kandidaat",
      interview: "Plan interview",
      contract: "Contract opmaken",
      reference_check: "Check referenties",
      custom: "Aangepaste actie",
    };
    return labels[type] || type;
  };

  const SECTOREN = ["VVT", "GGZ", "GHZ", "Jeugdzorg", "Ziekenhuis/Klinisch", "Thuiszorg"];
  const DOELGROEPEN = ["Ouderen", "LVB", "Psychiatrie", "Somatiek", "Kinderen/Jeugd", "Verslaving"];
  const BESCHIKBAARHEDEN = ["<24 uur/week", "24-32 uur/week", "32-40 uur/week", "Flexibel"];
  const BRONNEN = ["Indeed", "LinkedIn", "Eigen netwerk", "Website", "Referral", "Telefonisch", "Anders"];
  const ORGANISATIES = ["ABCzorg", "CitoZorg"];

  const toggleSector = (sector: string) => {
    setEditData(prev => ({
      ...prev,
      ervaring_sector: prev.ervaring_sector.includes(sector)
        ? prev.ervaring_sector.filter(s => s !== sector)
        : [...prev.ervaring_sector, sector]
    }));
  };

  const toggleDoelgroep = (doelgroep: string) => {
    setEditData(prev => ({
      ...prev,
      doelgroep_ervaring: prev.doelgroep_ervaring.includes(doelgroep)
        ? prev.doelgroep_ervaring.filter(d => d !== doelgroep)
        : [...prev.doelgroep_ervaring, doelgroep]
    }));
  };

  const handleQuickOrganizationAssign = async (organization: string) => {
    if (!application?.id) return;

    setUpdating(true);
    try {
      const updatedExtractedData = {
        ...application.extracted_data,
        assigned_organization: organization,
      };

      const { error } = await supabase
        .from("professional_applications")
        .update({
          extracted_data: updatedExtractedData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", application.id);

      if (error) throw error;

      toast.success(`Bemiddelingsbureau ingesteld op ${organization}`);
      onApplicationUpdated();
    } catch (error) {
      console.error("Error assigning organization:", error);
      toast.error("Fout bij toewijzen bemiddelingsbureau");
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!application?.id) return;

    setSavingEdit(true);
    try {
      const updatedExtractedData = {
        ...application.extracted_data,
        telefoon: editData.telefoon || null,
        regio: editData.regio || null,
        functie_niveau: editData.functie_niveau || null,
        werkvorm: editData.werkvorm || null,
        beschikbaarheid: editData.beschikbaarheid || null,
        ervaring_sector: editData.ervaring_sector,
        doelgroep_ervaring: editData.doelgroep_ervaring,
        eigen_vervoer: editData.eigen_vervoer,
        bron: editData.bron || null,
        opmerkingen: editData.opmerkingen || null,
        assigned_organization: editData.assigned_organization || null,
      };

      // Basis velden (75%)
      const basisFields = {
        naam: updatedExtractedData.naam,
        email: application.email_from,
        functie_niveau: updatedExtractedData.functie_niveau,
        werkvorm: updatedExtractedData.werkvorm,
        regio: updatedExtractedData.regio,
        telefoon: updatedExtractedData.telefoon,
        ervaring_sector: updatedExtractedData.ervaring_sector,
        beschikbaarheid: updatedExtractedData.beschikbaarheid,
        doelgroep_ervaring: updatedExtractedData.doelgroep_ervaring,
      };

      const basisWeights = {
        naam: 10, email: 10, telefoon: 8, functie_niveau: 15,
        werkvorm: 10, regio: 8, beschikbaarheid: 4,
        ervaring_sector: 5, doelgroep_ervaring: 5,
      };

      // Verrijking velden (25%)
      const verrijkingFields = {
        jaren_ervaring: updatedExtractedData.jaren_ervaring,
        opleidingen: updatedExtractedData.opleidingen,
        leidinggevende_ervaring: updatedExtractedData.leidinggevende_ervaring,
        postcode: updatedExtractedData.postcode,
        certificaten: updatedExtractedData.certificaten,
        nachtdienst_bereid: updatedExtractedData.nachtdienst_bereid,
        weekenddienst_bereid: updatedExtractedData.weekenddienst_bereid,
        talen: updatedExtractedData.talen,
      };

      const verrijkingWeights = {
        jaren_ervaring: 5, opleidingen: 5, leidinggevende_ervaring: 3,
        postcode: 3, certificaten: 3, nachtdienst_bereid: 2,
        weekenddienst_bereid: 2, talen: 2,
      };

      let score = 0;
      Object.entries(basisFields).forEach(([key, value]) => {
        if (value && (Array.isArray(value) ? value.length > 0 : true)) {
          score += basisWeights[key as keyof typeof basisWeights] || 0;
        }
      });
      Object.entries(verrijkingFields).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          if (Array.isArray(value) ? value.length > 0 : true) {
            score += verrijkingWeights[key as keyof typeof verrijkingWeights] || 0;
          }
        }
      });

      const completeness_score = Math.min(100, Math.round(score));

      const { error } = await supabase
        .from("professional_applications")
        .update({
          extracted_data: updatedExtractedData,
          completeness_score,
          updated_at: new Date().toISOString(),
        })
        .eq("id", application.id);

      if (error) throw error;

      toast.success("Gegevens bijgewerkt");
      setEditMode(false);
      onApplicationUpdated();
    } catch (error) {
      console.error("Error updating application:", error);
      toast.error("Fout bij bijwerken van gegevens");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCreateAction = async () => {
    if (!application?.id) return;

    if (actionType === "call" && !application.extracted_data?.telefoon) {
      toast.error("Telefoonnummer is vereist om deze actie aan te maken");
      return;
    }

    let title = "";
    const candidateName = application.professionals?.full_name || application.email_from;
    
    if (actionType === "custom" && !customTitle.trim()) {
      toast.error("Vul een titel in voor de aangepaste actie");
      return;
    }

    switch (actionType) {
      case "call":
        title = `Bel ${candidateName}`;
        break;
      case "interview":
        title = `Plan interview met ${candidateName}`;
        break;
      case "contract":
        title = `Contract opmaken voor ${candidateName}`;
        break;
      case "reference_check":
        title = `Check referenties ${candidateName}`;
        break;
      case "custom":
        title = customTitle.trim();
        break;
    }

    setCreatingAction(true);
    try {
      logger.log('[handleCreateAction] Starting action creation...', {
        applicationId: application.id,
        actionType,
        title,
        actionPriority,
        actionDueDate,
        actionDueTime
      });

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      logger.log('[handleCreateAction] Auth result:', {
        userId: user?.id,
        userEmail: user?.email,
        authError: authError ? { message: authError.message, status: authError.status } : null
      });

      if (!user) throw new Error("Not authenticated");

      const { data: orgData, error: orgError } = await supabase
        .from('user_organizations')
        .select('org_id, role')
        .eq('user_id', user.id);

      logger.log('[handleCreateAction] Organization lookup result:', {
        userId: user.id,
        orgData,
        orgError: orgError ? { message: orgError.message, code: orgError.code, details: orgError.details } : null
      });

      if (!orgData || orgData.length === 0) {
        logger.error('[handleCreateAction] No organization found for user:', user.id);
        throw new Error("Je bent niet gekoppeld aan een organisatie. Neem contact op met je beheerder.");
      }

      // Use first organization if multiple
      const selectedOrg = orgData[0];
      logger.log('[handleCreateAction] Using organization:', selectedOrg);

      let dueAt = null;
      if (actionDueDate) {
        const [hours, minutes] = actionDueTime.split(':').map(Number);
        const combined = new Date(actionDueDate);
        combined.setHours(hours, minutes, 0, 0);
        dueAt = combined.toISOString();
      }

      const taskPayload = {
        org_id: selectedOrg.org_id,
        application_id: application.id,
        recruitment_action_type: actionType,
        title,
        description: actionNotes || `Actie voor sollicitatie van ${candidateName}`,
        priority: actionPriority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        category: 'recruitment',
        status: 'todo',
        reporter_id: user.id,
        due_at: dueAt,
      };

      logger.log('[handleCreateAction] Inserting task with payload:', taskPayload);

      const { data: insertData, error: insertError } = await supabase
        .from('tasks')
        .insert([taskPayload])
        .select();

      logger.log('[handleCreateAction] Insert result:', {
        data: insertData,
        error: insertError ? { 
          message: insertError.message, 
          code: insertError.code, 
          details: insertError.details,
          hint: insertError.hint 
        } : null
      });

      if (insertError) throw insertError;

      logger.log('[handleCreateAction] Task created successfully:', insertData);
      toast.success("Actie aangemaakt");
      
      setShowActionForm(false);
      setCustomTitle("");
      setActionNotes("");
      setActionType("call");
      setActionPriority("MEDIUM");
      setActionDueDate(undefined);
      setActionDueTime("09:00");
      
      loadLinkedTasks();
    } catch (error: any) {
      console.error('[handleCreateAction] FULL ERROR:', {
        error,
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        stack: error?.stack
      });
      toast.error(error?.message || "Fout bij aanmaken actie");
    } finally {
      setCreatingAction(false);
    }
  };

  const handleConvertToProfessional = async () => {
    setConvertingToProfessional(true);
    
    const result = await convertApplicationToProfessional(application, { 
      showToast: true,
      silent: false 
    });
    
    setConvertingToProfessional(false);
    
    if (result.success) {
      onApplicationUpdated();
      onOpenChange(false);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("professional_applications")
        .update({ 
          deleted_at: new Date().toISOString(),
          deleted_by: user.id 
        })
        .eq("id", application.id);

      if (error) throw error;

      toast.success("Sollicitatie verwijderd");
      setDeleteDialogOpen(false);
      onApplicationUpdated();
      setTimeout(() => onOpenChange(false), 100);
    } catch (error) {
      console.error("Error deleting application:", error);
      toast.error("Kon sollicitatie niet verwijderen");
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>Sollicitatie Details</DialogTitle>
        </DialogHeader>

        {/* Hero Header Section */}
        <div className="flex items-start gap-4 pb-4">
          {/* Avatar with Photo Upload */}
          <div className="relative group">
            <Avatar 
              className={`h-24 w-24 border-2 border-border ring-4 ring-background shadow-xl ${photoUrl ? 'cursor-pointer hover:ring-primary/30 transition-all' : ''}`}
              onClick={() => photoUrl && setLightboxOpen(true)}
            >
              {photoUrl ? (
                <AvatarImage 
                  src={photoUrl} 
                  alt={candidateName} 
                  className="object-cover"
                />
              ) : null}
              <AvatarFallback className={`text-2xl font-semibold ${
                getFieldValue(application.extracted_data?.functie_niveau) === 'HBO-V' 
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                  : getFieldValue(application.extracted_data?.functie_niveau) === 'VIG'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : getFieldValue(application.extracted_data?.functie_niveau) === 'Begeleider'
                      ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300'
                      : 'bg-muted text-muted-foreground'
              }`}>
                {candidateName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            
            {/* Zoom indicator when photo exists */}
            {photoUrl && (
              <div 
                className="absolute bottom-0 right-0 bg-black/60 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                onClick={() => setLightboxOpen(true)}
              >
                <ZoomIn className="h-4 w-4" />
              </div>
            )}
            
            {/* Photo upload overlay */}
            {!photoUrl && (
              <label 
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Upload foto"
              >
                <Upload className="h-6 w-6 text-white" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    
                    try {
                      const fileExt = file.name.split('.').pop();
                      const fileName = `${application.id}.${fileExt}`;
                      
                      const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('profile-photos')
                        .upload(fileName, file, { upsert: true });
                      
                      if (uploadError) throw uploadError;
                      
                      const { data: { publicUrl } } = supabase.storage
                        .from('profile-photos')
                        .getPublicUrl(fileName);
                      
                      // Update extracted_data with photo URL
                      const updatedData = {
                        ...application.extracted_data,
                        profile_photo_url: publicUrl,
                      };
                      
                      const { error: updateError } = await supabase
                        .from('professional_applications')
                        .update({ extracted_data: updatedData })
                        .eq('id', application.id);
                      
                      if (updateError) throw updateError;
                      
                      toast.success('Foto geüpload');
                      onApplicationUpdated();
                    } catch (error: any) {
                      console.error('Photo upload error:', error);
                      toast.error('Fout bij uploaden foto');
                    }
                  }}
                />
              </label>
            )}
            
            {/* Photo detected badge */}
            {getFieldValue(application.extracted_data?.has_profile_photo) && !photoUrl && (
              <div className="absolute -bottom-1 -right-1 bg-amber-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-medium">
                📷
              </div>
            )}
          </div>

          {/* Name & Metadata */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold tracking-tight truncate">
                  {candidateName}
                </h2>
                <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground">
                  {getFieldValue(application.extracted_data?.functie_niveau) && (
                    <span className="font-medium text-foreground">
                      {getFieldValue(application.extracted_data?.functie_niveau)}
                    </span>
                  )}
                  {getFieldValue(application.extracted_data?.werkvorm) && (
                    <>
                      <span>•</span>
                      <span>{getFieldValue(application.extracted_data?.werkvorm)}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{getStageLabel(application.pipeline_stage)}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Inline NAW Metadata */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
              {(getFieldValue(application.extracted_data?.woonplaats) || getFieldValue(application.extracted_data?.regio)) && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>
                    {getFieldValue(application.extracted_data?.woonplaats) || getFieldValue(application.extracted_data?.regio)}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                <a href={`mailto:${application.email_from}`} className="hover:text-primary hover:underline truncate max-w-[200px]">
                  {application.email_from}
                </a>
              </div>
              {getFieldValue(application.extracted_data?.telefoon) && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  <a href={`tel:${getFieldValue(application.extracted_data?.telefoon)}`} className="hover:text-primary hover:underline">
                    {getFieldValue(application.extracted_data?.telefoon)}
                  </a>
                </div>
              )}
            </div>

            {/* Completeness Progress Bar with AI Followup Button */}
            {application.completeness_score !== null && (
              <div className="flex items-center gap-3 mt-3">
                <Progress 
                  value={application.completeness_score} 
                  className={`h-2 flex-1 max-w-[200px] ${
                    application.completeness_score >= 80 
                      ? '[&>div]:bg-green-500' 
                      : application.completeness_score >= 50 
                        ? '[&>div]:bg-yellow-500' 
                        : '[&>div]:bg-red-500'
                  }`}
                />
                <span className="text-xs font-medium text-muted-foreground">
                  {application.completeness_score}% compleet
                </span>
                <AIFollowupButton
                  applicationId={application.id}
                  completenessScore={application.completeness_score}
                  candidateEmail={application.email_from}
                  candidateName={candidateName}
                />
              </div>
            )}

            {/* Organization Badge */}
            {getFieldValue(application.extracted_data?.assigned_organization) && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mt-2 rounded-full bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <Building2 className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                  {getFieldValue(application.extracted_data?.assigned_organization)}
                </span>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Tabbed Interface */}
        {/* Check if werkvorm is CONFIRMED (not just present from CV) for showing Matches tab */}
        {(() => {
          const werkvormBevestigd = !!application.extracted_data?.werkvorm_bevestigd;
          const hasMatches = werkvormBevestigd;
          const vogStatus = application.vog_validation_status || 'missing';
          const diplomaStatus = application.diploma_validation_status || 'missing';
          
          return (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className={`grid w-full ${hasMatches ? 'grid-cols-5' : 'grid-cols-4'}`}>
                <TabsTrigger value="overview">Overzicht</TabsTrigger>
                {hasMatches && (
                  <TabsTrigger value="matches" className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Matches
                  </TabsTrigger>
                )}
                <TabsTrigger value="documents" className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  Documenten
                </TabsTrigger>
                <TabsTrigger value="actions">Acties</TabsTrigger>
                <TabsTrigger value="activity">Activiteit</TabsTrigger>
              </TabsList>

              {/* TAB: Documents - Document Upload & Verification Status */}
              <TabsContent value="documents" className="space-y-4">
                <div className="space-y-4">
                  {/* Werkvorm Detection Banner - shown when werkvorm is unknown */}
                  <WerkvormDetectionBanner
                    applicationId={application.id}
                    currentWerkvorm={getFieldValue(application.extracted_data?.werkvorm) as string | null}
                    onWerkvormUpdated={onApplicationUpdated}
                  />

                  {/* Diploma Verification Banner - checks for valid healthcare diploma */}
                  <DiplomaVerificationBanner
                    applicationId={application.id}
                    functieNiveau={getFieldValue(application.extracted_data?.functie_niveau) as string | null}
                    diplomaFilePath={(application as any).diploma_file_path || application.extracted_data?.diploma_file_path || null}
                    diplomaStatus={diplomaStatus}
                    candidateEmail={application.email || application.email_from}
                    candidateName={resolveApplicationName(application)}
                    orgId={application.org_id || '550e8400-e29b-41d4-a716-446655440000'}
                    onStatusUpdated={onApplicationUpdated}
                  />

                  {/* Diploma Level Mismatch Alert */}
                  <DiplomaLevelMismatchAlert
                    applicationId={application.id}
                    mismatchData={application.extracted_data?.diploma_level_mismatch}
                    candidateName={candidateName}
                    candidateEmail={application.email_from}
                    onResolved={onApplicationUpdated}
                  />

                  {/* Basis Document Upload Section */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Basis Documenten</h3>
                    <DocumentUploadSection
                      applicationId={application.id}
                      vogFilePath={application.extracted_data?.vog_file_path || null}
                      diplomaFilePath={(application as any).diploma_file_path || application.extracted_data?.diploma_file_path || null}
                      cvFilePath={application.cv_file_path}
                      cvFileName={application.cv_file_name}
                      vogStatus={vogStatus}
                      diplomaStatus={diplomaStatus}
                      vogVerificationResponse={application.vog_verification_response as any}
                      pipelineStage={application.pipeline_stage}
                      onUploadComplete={onApplicationUpdated}
                      onRequestNewVog={async () => {
                        try {
                          toast.info('VOG aanvraag wordt gestart...');
                          
                          // Trigger AI agent voor officiële VOG aanvraag
                          const { error: goalError } = await supabase.functions.invoke('ai-agent-orchestrator', {
                            body: {
                              action: 'create_goal',
                              goal_type: 'request_new_vog',
                              goal_description: `Vraag officiële VOG aan voor ${resolveApplicationName(application)}`,
                              org_id: application.org_id,
                              input_data: {
                                application_id: application.id,
                                candidate_email: application.email || application.email_from,
                                candidate_name: resolveApplicationName(application),
                                rejection_reason: 'new_employee', // Nieuwe medewerker heeft VOG nodig
                                vog_validation_details: { trigger: 'manual_request' }
                              }
                            }
                          });
                          
                          if (goalError) throw goalError;
                          
                          // Execute immediately
                          await supabase.functions.invoke('ai-agent-orchestrator', {
                            body: { action: 'execute_actions' }
                          });
                          
                          // Update pipeline stage naar screening
                          await supabase
                            .from('professional_applications')
                            .update({ pipeline_stage: 'screening' })
                            .eq('id', application.id);
                          
                          toast.success('VOG aanvraag gestart', {
                            description: 'Kandidaat ontvangt email met instructies voor officiële VOG aanvraag via Justis'
                          });
                          
                          onApplicationUpdated();
                        } catch (err) {
                          console.error('VOG request error:', err);
                          toast.error('Kon VOG aanvraag niet starten', {
                            description: 'Probeer het later opnieuw'
                          });
                        }
                      }}
                    />
                  </div>

                  {/* ZZP Document Upload Section - Only shown for ZZP werkvorm */}
                  <ZZPDocumentUploadSection
                    applicationId={application.id}
                    werkvorm={getFieldValue(application.extracted_data?.werkvorm) as string | null}
                    bedrijfsnaam={(application as any).bedrijfsnaam}
                    kvkNummer={getFieldValue(application.extracted_data?.kvk_nummer) as string | null}
                    iban={(application as any).iban}
                    beroepsaansprakelijkheidPath={(application as any).beroepsaansprakelijkheid_path}
                    kvkUittrekselPath={(application as any).kvk_uittreksel_path}
                    klachtenportaalWkkgzPath={(application as any).klachtenportaal_wkkgz_path}
                    identiteitsbewijsPath={(application as any).identiteitsbewijs_path}
                    bhvCertificaatPath={(application as any).bhv_certificaat_path}
                    tilliftCertificaatPath={(application as any).tillift_certificaat_path}
                    overigeCertificeringenPaths={(application as any).overige_certificeringen_paths}
                    onUploadComplete={onApplicationUpdated}
                  />

                  {/* Document Verification Status */}
                  <div className="pt-2">
                    <h3 className="text-sm font-semibold mb-3">Verificatie Status</h3>
                    <DocumentVerificationStatus
                      applicationId={application.id}
                      vogStatus={vogStatus as any}
                      vogSource={application.vog_validation_source}
                      vogIssueDate={application.vog_issue_date}
                      vogValidUntil={application.vog_valid_until}
                      vogVerificationResponse={application.vog_verification_response}
                      diplomaStatus={diplomaStatus as any}
                      diplomaSource={application.diploma_validation_source}
                      vogFilePath={application.extracted_data?.vog_file_path || null}
                      diplomaFilePath={(application as any).diploma_file_path || application.extracted_data?.diploma_file_path || null}
                      duoVerificationResult={(application as any).duo_verification_result}
                      duoVerifiedAt={(application as any).duo_verified_at}
                      diplomaVerificationResponse={(application as any).diploma_verification_response}
                      onStatusUpdate={onApplicationUpdated}
                    />
                  </div>

                  {/* Stage Transition Buttons */}
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium mb-3">Pipeline Stappen</h4>
                    <div className="flex flex-wrap gap-2">
                      {application.pipeline_stage === 'nieuw' && (
                        <StageTransitionButton
                          applicationId={application.id}
                          currentStage="nieuw"
                          targetStage="interview"
                          vogStatus={vogStatus}
                          diplomaStatus={diplomaStatus}
                          onSuccess={onApplicationUpdated}
                          variant="outline"
                          size="sm"
                        />
                      )}
                      {application.pipeline_stage === 'interview' && (
                        <StageTransitionButton
                          applicationId={application.id}
                          currentStage="interview"
                          targetStage="screening"
                          vogStatus={vogStatus}
                          diplomaStatus={diplomaStatus}
                          onSuccess={onApplicationUpdated}
                          variant="outline"
                          size="sm"
                        />
                      )}
                      {application.pipeline_stage === 'screening' && (
                        <StageTransitionButton
                          applicationId={application.id}
                          currentStage="screening"
                          targetStage="goedgekeurd"
                          vogStatus={vogStatus}
                          diplomaStatus={diplomaStatus}
                          onSuccess={onApplicationUpdated}
                          variant="outline"
                          size="sm"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* TAB: Matches - Only shown when werkvorm is known */}
              {hasMatches && (
                <TabsContent value="matches">
                  <ApplicationMatchesTab 
                    application={{
                      id: application.id,
                      extracted_data: application.extracted_data,
                      completeness_score: application.completeness_score,
                      professional_id: application.professional_id,
                    }}
                    onApplicationUpdated={onApplicationUpdated}
                  />
                </TabsContent>
              )}

          {/* TAB 1: Overzicht */}
          <TabsContent value="overview" className="space-y-4">
            {/* Completeness Score */}
            {application.completeness_score !== null && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Compleetheid</span>
                  <span className="text-sm font-semibold">{application.completeness_score}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      application.completeness_score >= 80
                        ? "bg-green-500"
                        : application.completeness_score >= 50
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${application.completeness_score}%` }}
                  />
                </div>
              </div>
            )}

            {/* Missing Info */}
            {application.missing_info && Array.isArray(application.missing_info) && application.missing_info.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <span>Ontbrekende informatie</span>
                </div>
                <ul className="space-y-1 pl-6">
                  {application.missing_info.map((item: string, index: number) => (
                    <li key={index} className="text-sm text-muted-foreground list-disc">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Contactgegevens - Collapsible */}
            <Collapsible open={contactOpen} onOpenChange={setContactOpen}>
              <div className="rounded-lg border">
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Contactgegevens</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!editMode && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditMode(true);
                          }}
                        >
                          Bewerk
                        </Button>
                      )}
                      {contactOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 space-y-3">
                    {editMode ? (
                      <div className="space-y-3">
                        <Input
                          placeholder="Telefoonnummer"
                          value={editData.telefoon}
                          onChange={(e) => setEditData({ ...editData, telefoon: e.target.value })}
                        />
                        <Input
                          placeholder="Regio"
                          value={editData.regio}
                          onChange={(e) => setEditData({ ...editData, regio: e.target.value })}
                        />
                        <Select 
                          value={editData.functie_niveau} 
                          onValueChange={(value) => setEditData({ ...editData, functie_niveau: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Functieniveau" />
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
                        <Select 
                          value={editData.werkvorm} 
                          onValueChange={(value) => setEditData({ ...editData, werkvorm: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Werkvorm" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ZZP">ZZP</SelectItem>
                            <SelectItem value="Uitzendkracht">Uitzendkracht</SelectItem>
                            <SelectItem value="ABCito constructie">ABCito constructie</SelectItem>
                          </SelectContent>
                        </Select>

                        <div className="space-y-2">
                          <Label className="text-xs">Ervaring sector</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {SECTOREN.map((sector) => (
                              <Badge
                                key={sector}
                                variant="outline"
                                className={`cursor-pointer transition-all text-xs ${getSectorColor(sector)} ${
                                  editData.ervaring_sector.includes(sector) ? "" : "opacity-50"
                                }`}
                                onClick={() => toggleSector(sector)}
                              >
                                {sector}
                                {editData.ervaring_sector.includes(sector) && (
                                  <X className="ml-1 h-3 w-3" />
                                )}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Doelgroep ervaring</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {DOELGROEPEN.map((dg) => (
                              <Badge
                                key={dg}
                                variant="outline"
                                className={`cursor-pointer transition-all text-xs ${getDoelgroepColor(dg)} ${
                                  editData.doelgroep_ervaring.includes(dg) ? "" : "opacity-50"
                                }`}
                                onClick={() => toggleDoelgroep(dg)}
                              >
                                {dg}
                                {editData.doelgroep_ervaring.includes(dg) && (
                                  <X className="ml-1 h-3 w-3" />
                                )}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <Select 
                          value={editData.beschikbaarheid} 
                          onValueChange={(value) => setEditData({ ...editData, beschikbaarheid: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Beschikbaarheid" />
                          </SelectTrigger>
                          <SelectContent>
                            {BESCHIKBAARHEDEN.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                          </SelectContent>
                        </Select>

                        <Select 
                          value={editData.eigen_vervoer === null ? "onbekend" : editData.eigen_vervoer ? "ja" : "nee"} 
                          onValueChange={(value) => setEditData({ 
                            ...editData, 
                            eigen_vervoer: value === "onbekend" ? null : value === "ja" 
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Eigen vervoer" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="onbekend">Eigen vervoer onbekend</SelectItem>
                            <SelectItem value="ja">Ja, eigen vervoer</SelectItem>
                            <SelectItem value="nee">Nee, geen eigen vervoer</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select 
                          value={editData.bron} 
                          onValueChange={(value) => setEditData({ ...editData, bron: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Bron" />
                          </SelectTrigger>
                          <SelectContent>
                            {BRONNEN.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                          </SelectContent>
                        </Select>

                        <Textarea
                          placeholder="Opmerkingen..."
                          value={editData.opmerkingen}
                          onChange={(e) => setEditData({ ...editData, opmerkingen: e.target.value })}
                          rows={3}
                        />

                        <Select 
                          value={editData.assigned_organization} 
                          onValueChange={(value) => setEditData({ ...editData, assigned_organization: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Bemiddelingsbureau" />
                          </SelectTrigger>
                          <SelectContent>
                            {ORGANISATIES.map(org => (
                              <SelectItem key={org} value={org}>{org}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <div className="flex gap-2">
                          <Button
                            onClick={handleSaveEdit}
                            disabled={savingEdit}
                            className="flex-1"
                          >
                            {savingEdit ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Opslaan...
                              </>
                            ) : (
                              "Opslaan"
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setEditMode(false)}
                            disabled={savingEdit}
                          >
                            Annuleren
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <a 
                            href={`mailto:${application.email_from}`}
                            className="text-sm text-primary hover:underline"
                          >
                            {application.email_from}
                          </a>
                        </div>
                        {getFieldValue(application.extracted_data?.telefoon) && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <a 
                              href={`tel:${getFieldValue(application.extracted_data?.telefoon)}`}
                              className="text-sm text-primary hover:underline"
                            >
                              {getFieldValue(application.extracted_data?.telefoon)}
                            </a>
                          </div>
                        )}
                        
                        {/* Persoonsgegevens NAW sectie */}
                        {(getFieldValue(application.extracted_data?.woonplaats) || 
                          getFieldValue(application.extracted_data?.postcode) || 
                          getFieldValue(application.extracted_data?.geboortedatum) ||
                          getFieldValue(application.extracted_data?.adres) ||
                          getFieldValue(application.extracted_data?.regio)) && (
                          <div className="pt-2 mt-2 border-t border-border/50">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Persoonsgegevens</span>
                            <div className="space-y-1.5 mt-2">
                              {getFieldValue(application.extracted_data?.woonplaats) && (
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">
                                    {getFieldValue(application.extracted_data?.woonplaats)}
                                    {getFieldValue(application.extracted_data?.postcode) && (
                                      <span className="text-muted-foreground ml-1">
                                        ({getFieldValue(application.extracted_data?.postcode)})
                                      </span>
                                    )}
                                  </span>
                                </div>
                              )}
                              {!getFieldValue(application.extracted_data?.woonplaats) && getFieldValue(application.extracted_data?.postcode) && (
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">Postcode: {getFieldValue(application.extracted_data?.postcode)}</span>
                                </div>
                              )}
                              {getFieldValue(application.extracted_data?.adres) && (
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">{getFieldValue(application.extracted_data?.adres)}</span>
                                </div>
                              )}
                              {!getFieldValue(application.extracted_data?.woonplaats) && getFieldValue(application.extracted_data?.regio) && (
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">Regio: {getFieldValue(application.extracted_data?.regio)}</span>
                                </div>
                              )}
                              {getFieldValue(application.extracted_data?.geboortedatum) && (
                                <div className="flex items-center gap-2">
                                  <Cake className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">{getFieldValue(application.extracted_data?.geboortedatum)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* Extracted Data - Collapsible */}
            <Collapsible open={extractedOpen} onOpenChange={setExtractedOpen}>
              <div className="rounded-lg border">
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-semibold">Geëxtraheerde gegevens</span>
                      {(application.extracted_data?.global_confidence || application.extracted_data?.confidence) && (
                        <ConfidenceBadge confidence={application.extracted_data.global_confidence || application.extracted_data.confidence} />
                      )}
                    </div>
                    {extractedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4">
                    {application.extracted_data && Object.keys(application.extracted_data).length > 0 && (
                      <div className="space-y-3">
                        {/* Basis gegevens */}
                        {getFieldValue(application.extracted_data?.functie_niveau) && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-32">Functieniveau:</span>
                            <Badge variant="outline" className={getFunctieColor(getFieldValue(application.extracted_data?.functie_niveau) as string)}>
                              {getFieldValue(application.extracted_data?.functie_niveau)}
                            </Badge>
                            <ConfidenceBadge 
                              field={application.extracted_data?.functie_niveau} 
                              fallbackGlobal={application.extracted_data?.global_confidence || application.extracted_data?.confidence} 
                            />
                          </div>
                        )}
                        
                        {/* NIEUW: Jaren ervaring */}
                        {getFieldValue(application.extracted_data?.jaren_ervaring) && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-32">Ervaring:</span>
                            {(() => {
                              const jaren = getFieldValue(application.extracted_data?.jaren_ervaring) as number;
                              return (
                                <Badge variant="outline" className={
                                  jaren >= 8 
                                    ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                                    : jaren >= 5
                                      ? "bg-blue-100 text-blue-700 border-blue-300"
                                      : "bg-gray-100 text-gray-700 border-gray-300"
                                }>
                                  {jaren} jaar
                                  {jaren >= 8 && " (Expert)"}
                                  {jaren >= 5 && jaren < 8 && " (Ervaren)"}
                                </Badge>
                              );
                            })()}
                            <ConfidenceBadge 
                              field={application.extracted_data?.jaren_ervaring} 
                              fallbackGlobal={application.extracted_data?.global_confidence || application.extracted_data?.confidence} 
                            />
                          </div>
                        )}
                        
                        {/* NIEUW: Leidinggevende ervaring */}
                        {getFieldValue(application.extracted_data?.leidinggevende_ervaring) && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-32">Leidinggevend:</span>
                            <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300">
                              ✓ {(getFieldValue(application.extracted_data?.leidinggevende_functies) as string[])?.join(", ") || "Ja"}
                            </Badge>
                            <ConfidenceBadge 
                              field={application.extracted_data?.leidinggevende_ervaring} 
                              fallbackGlobal={application.extracted_data?.global_confidence || application.extracted_data?.confidence} 
                            />
                          </div>
                        )}
                        
                        {(() => {
                          const sectors = getFieldValue(application.extracted_data?.ervaring_sector) as string[] | null;
                          return sectors && sectors.length > 0 && (
                            <div className="flex items-start gap-2">
                              <span className="text-xs text-muted-foreground w-32">Sectoren:</span>
                              <div className="flex flex-wrap gap-1">
                                {sectors.map((s: string) => (
                                  <Badge key={s} variant="outline" className={getSectorColor(s)}>{s}</Badge>
                                ))}
                                <ConfidenceBadge 
                                  field={application.extracted_data?.ervaring_sector} 
                                  fallbackGlobal={application.extracted_data?.global_confidence || application.extracted_data?.confidence} 
                                />
                              </div>
                            </div>
                          );
                        })()}
                        
                        {(() => {
                          const doelgroepen = getFieldValue(application.extracted_data?.doelgroep_ervaring) as string[] | null;
                          return doelgroepen && doelgroepen.length > 0 && (
                            <div className="flex items-start gap-2">
                              <span className="text-xs text-muted-foreground w-32">Doelgroepen:</span>
                              <div className="flex flex-wrap gap-1">
                                {doelgroepen.map((d: string) => (
                                  <Badge key={d} variant="outline" className={getDoelgroepColor(d)}>{d}</Badge>
                                ))}
                                <ConfidenceBadge 
                                  field={application.extracted_data?.doelgroep_ervaring} 
                                  fallbackGlobal={application.extracted_data?.global_confidence || application.extracted_data?.confidence} 
                                />
                              </div>
                            </div>
                          );
                        })()}
                        
                        {/* NIEUW: Specifieke doelgroepen */}
                        {(() => {
                          const specifiek = getFieldValue(application.extracted_data?.specifieke_doelgroepen) as string[] | null;
                          return specifiek && specifiek.length > 0 && (
                            <div className="flex items-start gap-2">
                              <span className="text-xs text-muted-foreground w-32">Specialisaties:</span>
                              <div className="flex flex-wrap gap-1">
                                {specifiek.map((d: string) => (
                                  <Badge key={d} variant="outline" className="bg-indigo-100 text-indigo-700 border-indigo-300">{d}</Badge>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                        
                        {getFieldValue(application.extracted_data?.werkvorm) && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-32">Werkvorm:</span>
                            <span className="text-sm font-medium">{getFieldValue(application.extracted_data?.werkvorm)}</span>
                            <ConfidenceBadge 
                              field={application.extracted_data?.werkvorm} 
                              fallbackGlobal={application.extracted_data?.global_confidence || application.extracted_data?.confidence} 
                            />
                          </div>
                        )}
                        
                        {getFieldValue(application.extracted_data?.beschikbaarheid) && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-32">Beschikbaarheid:</span>
                            <span className="text-sm font-medium">{getFieldValue(application.extracted_data?.beschikbaarheid)}</span>
                            <ConfidenceBadge 
                              field={application.extracted_data?.beschikbaarheid} 
                              fallbackGlobal={application.extracted_data?.global_confidence || application.extracted_data?.confidence} 
                            />
                          </div>
                        )}
                        
                        {/* NIEUW: Nacht/weekend dienst */}
                        {(getFieldValue(application.extracted_data?.nachtdienst_bereid) !== null || getFieldValue(application.extracted_data?.weekenddienst_bereid) !== null) && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-32">Diensten:</span>
                            <div className="flex gap-2">
                              {getFieldValue(application.extracted_data?.nachtdienst_bereid) && (
                                <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300">Nachtdienst ✓</Badge>
                              )}
                              {getFieldValue(application.extracted_data?.weekenddienst_bereid) && (
                                <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300">Weekend ✓</Badge>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Mobiliteit */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-32">Mobiliteit:</span>
                          <div className="flex gap-2">
                            {(() => {
                              const eigenVervoer = getFieldValue(application.extracted_data?.eigen_vervoer);
                              const rijbewijs = getFieldValue(application.extracted_data?.rijbewijs);
                              const maxReisafstand = getFieldValue(application.extracted_data?.max_reisafstand_km);
                              
                              // Explicitly true = has own transport
                              if (eigenVervoer === true) {
                                return <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">Auto ✓</Badge>;
                              }
                              // Explicitly false = no own transport
                              if (eigenVervoer === false) {
                                return <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300">Geen auto ✗</Badge>;
                              }
                              // null/undefined = unknown
                              return <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">Vervoer onbekend</Badge>;
                            })()}
                            {getFieldValue(application.extracted_data?.rijbewijs) && (
                              <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-300">Rijbewijs ✓</Badge>
                            )}
                            {getFieldValue(application.extracted_data?.max_reisafstand_km) && (
                              <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">Max {getFieldValue(application.extracted_data?.max_reisafstand_km)}km</Badge>
                            )}
                            <ConfidenceBadge 
                              field={application.extracted_data?.eigen_vervoer} 
                              fallbackGlobal={application.extracted_data?.global_confidence || application.extracted_data?.confidence} 
                            />
                          </div>
                        </div>
                        
                        {/* NIEUW: Opleidingen */}
                        {(() => {
                          const opleidingen = getFieldValue(application.extracted_data?.opleidingen) as any[] | null;
                          return opleidingen && opleidingen.length > 0 && (
                            <div className="flex items-start gap-2">
                              <span className="text-xs text-muted-foreground w-32">Opleidingen:</span>
                              <div className="flex flex-col gap-1">
                                {opleidingen.slice(0, 3).map((opl: any, idx: number) => (
                                  <span key={idx} className="text-sm">
                                    {opl.naam} {opl.jaar ? `(${opl.jaar})` : ""}
                                  </span>
                                ))}
                                {opleidingen.length > 3 && (
                                  <span className="text-xs text-muted-foreground">+{opleidingen.length - 3} meer</span>
                                )}
                              </div>
                              <ConfidenceBadge 
                                field={application.extracted_data?.opleidingen} 
                                fallbackGlobal={application.extracted_data?.global_confidence || application.extracted_data?.confidence} 
                              />
                            </div>
                          );
                        })()}
                        
                        {/* NIEUW: Certificaten */}
                        {(() => {
                          const certificaten = getFieldValue(application.extracted_data?.certificaten) as string[] | null;
                          return certificaten && certificaten.length > 0 && (
                            <div className="flex items-start gap-2">
                              <span className="text-xs text-muted-foreground w-32">Certificaten:</span>
                              <div className="flex flex-wrap gap-1">
                                {certificaten.map((cert: string) => (
                                  <Badge key={cert} variant="outline" className="bg-teal-100 text-teal-700 border-teal-300">{cert}</Badge>
                                ))}
                                <ConfidenceBadge 
                                  field={application.extracted_data?.certificaten} 
                                  fallbackGlobal={application.extracted_data?.global_confidence || application.extracted_data?.confidence} 
                                />
                              </div>
                            </div>
                          );
                        })()}
                        
                        {/* NIEUW: BIG nummer */}
                        {getFieldValue(application.extracted_data?.BIG_nummer) && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-32">BIG-nummer:</span>
                            <span className="text-sm font-mono">{getFieldValue(application.extracted_data?.BIG_nummer)}</span>
                            <ConfidenceBadge 
                              field={application.extracted_data?.BIG_nummer} 
                              fallbackGlobal={application.extracted_data?.global_confidence || application.extracted_data?.confidence} 
                            />
                          </div>
                        )}
                        
                        {/* NIEUW: Talen */}
                        {(() => {
                          const talen = getFieldValue(application.extracted_data?.talen) as string[] | null;
                          return talen && talen.length > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-32">Talen:</span>
                              <span className="text-sm">{talen.join(", ")}</span>
                              <ConfidenceBadge 
                                field={application.extracted_data?.talen} 
                                fallbackGlobal={application.extracted_data?.global_confidence || application.extracted_data?.confidence} 
                              />
                            </div>
                          );
                        })()}
                        
                        {/* NIEUW: Postcode/Woonplaats */}
                        {(getFieldValue(application.extracted_data?.postcode) || getFieldValue(application.extracted_data?.woonplaats)) && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-32">Locatie:</span>
                            <span className="text-sm">
                              {[getFieldValue(application.extracted_data?.postcode), getFieldValue(application.extracted_data?.woonplaats)].filter(Boolean).join(", ")}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* Metadata */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>Aangemaakt: {format(new Date(application.created_at), "d MMM yyyy HH:mm", { locale: nl })}</span>
              </div>
              {application.updated_at && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Bijgewerkt: {format(new Date(application.updated_at), "d MMM yyyy HH:mm", { locale: nl })}</span>
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 2: Acties & Matching */}
          <TabsContent value="actions" className="space-y-4">
            {/* Convert to Professional */}
            {(application.pipeline_stage === 'goedgekeurd' || application.pipeline_stage === 'geplaatst') && 
             !application.professional_id && 
             (application.completeness_score || 0) >= 80 && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                      <UserPlus className="h-4 w-4 text-green-600" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-green-900 mb-1">
                      Klaar om Professional te worden!
                    </h4>
                    <p className="text-sm text-green-700 mb-3">
                      Deze kandidaat is goedgekeurd en kan omgezet worden naar een professional profiel.
                    </p>
                    <Button
                      onClick={handleConvertToProfessional}
                      disabled={convertingToProfessional}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      size="sm"
                    >
                      {convertingToProfessional ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Profiel aanmaken...
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Maak Professional Profiel
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActionType("call");
                  setShowActionForm(true);
                }}
                disabled={!application.extracted_data?.telefoon}
              >
                <Phone className="h-4 w-4 mr-2" />
                Bel kandidaat
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInterviewModalOpen(true)}
              >
                <CalendarClock className="h-4 w-4 mr-2" />
                Plan interview
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActionType("contract");
                  setShowActionForm(true);
                }}
                disabled={(application.completeness_score || 0) < 100}
              >
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Contract opmaken
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActionType("custom");
                  setShowActionForm(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Aangepaste actie
              </Button>
            </div>

            {/* Action Creation Form */}
            {showActionForm && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                <h4 className="text-sm font-semibold">Nieuwe Actie</h4>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Actie type</label>
                  <Select value={actionType} onValueChange={setActionType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">Bel kandidaat</SelectItem>
                      <SelectItem value="interview">Plan interview</SelectItem>
                      <SelectItem value="contract">Contract opmaken</SelectItem>
                      <SelectItem value="reference_check">Check referenties</SelectItem>
                      <SelectItem value="custom">Aangepaste actie</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {actionType === "custom" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Titel</label>
                    <Input
                      placeholder="Bijv. Voer telefonisch intake gesprek"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Prioriteit</label>
                  <Select value={actionPriority} onValueChange={setActionPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Laag</SelectItem>
                      <SelectItem value="MEDIUM">Normaal</SelectItem>
                      <SelectItem value="HIGH">Hoog</SelectItem>
                      <SelectItem value="CRITICAL">Kritiek</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {actionType === "interview" ? "Interview datum en tijd" : "Deadline"} (optioneel)
                  </label>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="flex-1 justify-start text-left font-normal"
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {actionDueDate ? format(actionDueDate, "d MMMM yyyy", { locale: nl }) : "Selecteer datum"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={actionDueDate}
                          onSelect={setActionDueDate}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    
                    {actionDueDate && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <Input
                          type="time"
                          value={actionDueTime}
                          onChange={(e) => setActionDueTime(e.target.value)}
                          className="w-[120px]"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Notities (optioneel)</label>
                  <Textarea
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="Extra informatie over deze actie..."
                    rows={3}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleCreateAction}
                    disabled={creatingAction}
                    className="flex-1"
                  >
                    {creatingAction ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Aanmaken...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Aanmaken
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowActionForm(false);
                      setCustomTitle("");
                      setActionNotes("");
                    }}
                    disabled={creatingAction}
                  >
                    Annuleren
                  </Button>
                </div>
              </div>
            )}

            <Separator />

            {/* Linked Tasks - Collapsible */}
            {linkedTasks.length > 0 && (
              <Collapsible open={actionsOpen} onOpenChange={setActionsOpen}>
                <div className="rounded-lg border">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-4">
                      <span className="text-sm font-medium">Lopende acties ({linkedTasks.length})</span>
                      {actionsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4 space-y-2">
                      {loadingTasks ? (
                        <div className="text-sm text-muted-foreground">Laden...</div>
                      ) : (
                        linkedTasks.map((task) => (
                          <div
                            key={task.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">{task.title}</p>
                                {task.recruitment_action_type && (
                                  <Badge variant="outline" className="text-xs">
                                    {getActionTypeLabel(task.recruitment_action_type)}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span>Status: {task.status}</span>
                                {task.profiles?.name && (
                                  <span>• {task.profiles.name}</span>
                                )}
                                {task.due_at && (
                                  <span>• Deadline: {format(new Date(task.due_at), "d MMM HH:mm", { locale: nl })}</span>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                window.location.href = `/lijst?task=${task.id}`;
                              }}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}

          </TabsContent>


          {/* TAB 3: Activiteit & Communicatie */}
          <TabsContent value="activity" className="space-y-4">
            {/* Team Notes */}
            <div className="space-y-3">
              <span className="text-sm font-medium flex items-center gap-2">
                💬 Team Notities
              </span>
              <ApplicationNotes applicationId={application.id} />
            </div>


            {/* Activity Timeline */}
            <div className="space-y-3">
              <span className="text-sm font-medium">Activiteit Timeline</span>
              <ApplicationActivityTimeline applicationId={application.id} />
            </div>

            <Separator />

            {/* Email Templates */}
            <EmailTemplateSuggestions 
              pipelineStage={application.pipeline_stage}
              candidateName={candidateName}
              functieNiveau={application.extracted_data?.functie_niveau}
            />

            <Separator />

            {/* Pipeline Stage Actions */}
            <div className="space-y-3">
              <span className="text-sm font-medium">Verplaats naar:</span>
              <div className="flex flex-wrap gap-2">
                {["nieuw", "interview", "screening", "goedgekeurd", "geplaatst", "afgewezen"].map((stage) => (
                  <Button
                    key={stage}
                    variant={application.pipeline_stage === stage ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleStageChange(stage)}
                    disabled={updating || application.pipeline_stage === stage}
                  >
                    {getStageLabel(stage)}
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>
            </Tabs>
          );
        })()}
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sollicitatie verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              De sollicitatie wordt verplaatst naar het archief. Je kunt deze later herstellen als dat nodig is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuleer</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Verwijderen..." : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Interview Scheduling Modal */}
      <InterviewSchedulingModal
        open={interviewModalOpen}
        onOpenChange={setInterviewModalOpen}
        applicationId={application.id}
        candidateName={candidateName}
        candidateEmail={application.email_from}
        candidatePhone={getFieldValue(application.extracted_data?.telefoon) || undefined}
        functieNiveau={getFieldValue(application.extracted_data?.functie_niveau) || undefined}
        onScheduled={() => {
          loadLinkedTasks();
          onApplicationUpdated();
        }}
      />
      {/* Photo Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-2xl p-2 bg-black/90 border-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Foto van {candidateName}</DialogTitle>
          </DialogHeader>
          <div className="relative flex items-center justify-center">
            {photoUrl && (
              <img 
                src={photoUrl} 
                alt={candidateName}
                className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
              />
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full"
              onClick={() => setLightboxOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}