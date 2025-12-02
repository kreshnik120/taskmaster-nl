import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Mail, User, FileText, Calendar, AlertCircle, CheckCircle2, Clock, Phone, CalendarClock, ClipboardCheck, Plus, ExternalLink, Loader2, X, Upload, Download, Eye, Trash2, Building2, UserPlus, ChevronDown, ChevronUp } from "lucide-react";
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
import { useState, useEffect } from "react";
import { convertApplicationToProfessional } from "@/lib/convertApplicationToProfessional";
import { ApplicationActivityTimeline } from "@/components/recruitment/ApplicationActivityTimeline";
import { EmailTemplateSuggestions } from "@/components/recruitment/EmailTemplateSuggestions";
import { MatchScoreBreakdown } from "@/components/recruitment/MatchScoreBreakdown";
import { ApplicationNotes } from "@/components/recruitment/ApplicationNotes";
import { AIMatchInsights } from "@/components/recruitment/AIMatchInsights";
import { SECTOR_SIMILARITY, functieMatchesAny, calculateRegioScore, calculateErvaringBonus, LEIDINGGEVENDE_BONUS } from "@/lib/constants/matchingConstants";

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
  // Support both old and new extracted_data formats for candidateName
  const candidateName = getFieldValue(application.extracted_data?.naam) || application.extracted_data?.naam || 'Kandidaat';
  
  const [updating, setUpdating] = useState(false);
  const [linkedTasks, setLinkedTasks] = useState<LinkedTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  
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
    eigen_vervoer: false,
    bron: "",
    opmerkingen: "",
    assigned_organization: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  
  // CV upload/download
  const [uploadingCV, setUploadingCV] = useState(false);
  const [downloadingCV, setDownloadingCV] = useState(false);
  
  // Convert to professional
  const [convertingToProfessional, setConvertingToProfessional] = useState(false);
  
  // Client matching
  const [matchedClients, setMatchedClients] = useState<any[]>([]);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  
  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
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
        eigen_vervoer: getFieldValue(application.extracted_data?.eigen_vervoer) || false,
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
      console.error('Error loading linked tasks:', error);
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
      console.error("Error updating stage:", error);
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

  const handleCVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
      toast.error("Alleen PDF bestanden toegestaan");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Bestand mag maximaal 10MB zijn");
      return;
    }
    
    setUploadingCV(true);
    try {
      const filePath = `${application.id}/${Date.now()}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('application-cvs')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      const { error: updateError } = await supabase
        .from('professional_applications')
        .update({
          cv_file_path: filePath,
          cv_file_name: file.name,
          updated_at: new Date().toISOString()
        })
        .eq('id', application.id);
      
      if (updateError) throw updateError;
      
      toast.success("CV succesvol geüpload");
      onApplicationUpdated();
    } catch (error) {
      console.error('Error uploading CV:', error);
      toast.error("Fout bij uploaden CV");
    } finally {
      setUploadingCV(false);
    }
  };

  const handleCVDownload = async () => {
    if (!application.cv_file_path) return;
    
    setDownloadingCV(true);
    try {
      const { data, error } = await supabase.storage
        .from('application-cvs')
        .download(application.cv_file_path);
      
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = application.cv_file_name || 'cv.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("CV gedownload");
    } catch (error) {
      console.error('Error downloading CV:', error);
      toast.error("Fout bij downloaden CV");
    } finally {
      setDownloadingCV(false);
    }
  };

  const handleCVView = async () => {
    if (!application.cv_file_path) return;
    
    try {
      const { data } = await supabase.storage
        .from('application-cvs')
        .createSignedUrl(application.cv_file_path, 3600);
      
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error) {
      console.error('Error viewing CV:', error);
      toast.error("Fout bij openen CV");
    }
  };

  const handleCVDelete = async () => {
    if (!application.cv_file_path) return;
    
    try {
      const { error: deleteError } = await supabase.storage
        .from('application-cvs')
        .remove([application.cv_file_path]);
      
      if (deleteError) throw deleteError;
      
      const { error: updateError } = await supabase
        .from('professional_applications')
        .update({
          cv_file_path: null,
          cv_file_name: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', application.id);
      
      if (updateError) throw updateError;
      
      toast.success("CV verwijderd");
      onApplicationUpdated();
    } catch (error) {
      console.error('Error deleting CV:', error);
      toast.error("Fout bij verwijderen CV");
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: orgData } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) throw new Error("No organization found");

      let dueAt = null;
      if (actionDueDate) {
        const [hours, minutes] = actionDueTime.split(':').map(Number);
        const combined = new Date(actionDueDate);
        combined.setHours(hours, minutes, 0, 0);
        dueAt = combined.toISOString();
      }

      const { error } = await supabase.from('tasks').insert([{
        org_id: orgData.org_id,
        application_id: application.id,
        recruitment_action_type: actionType,
        title,
        description: actionNotes || `Actie voor sollicitatie van ${candidateName}`,
        priority: actionPriority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        category: 'recruitment',
        status: 'todo',
        reporter_id: user.id,
        due_at: dueAt,
      }]);

      if (error) throw error;

      toast.success("Actie aangemaakt");
      
      setShowActionForm(false);
      setCustomTitle("");
      setActionNotes("");
      setActionType("call");
      setActionPriority("MEDIUM");
      setActionDueDate(undefined);
      setActionDueTime("09:00");
      
      loadLinkedTasks();
    } catch (error) {
      console.error('Error creating action:', error);
      toast.error("Fout bij aanmaken actie");
    } finally {
      setCreatingAction(false);
    }
  };

  const findMatchingClients = async () => {
    if (!application.extracted_data) {
      toast.error("Onvoldoende sollicitant gegevens");
      return;
    }

    setMatchingLoading(true);
    setShowMatches(true);
    try {
      const { data: clients, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      
      if (error) throw error;
      if (!clients?.length) {
        setMatchedClients([]);
        return;
      }

      const extractedData = application.extracted_data;

      // Theoretisch maximum: Regio(30) + Sector(25) + Doelgroep(20) + Functie(15) + Bureau(10) + Ervaring(5) + Leiding(3) + Postcode(5) + Nacht(3) + Weekend(3) + Cert(5) = 124
      const MAX_POSSIBLE_SCORE = 124;
      
      const scored = clients.map(client => {
        let score = 0;
        let reasons: string[] = [];
        
        // Region matching with semantic province support
        const clientRegios = client.regio || [];
        const regioResult = calculateRegioScore(extractedData.regio, clientRegios);
        
        // Fallback: check if regio appears in client name
        const applicantRegios = (extractedData.regio || '')
          .toLowerCase()
          .split(',')
          .map((r: string) => r.trim())
          .filter(Boolean);
        const clientNameLower = (client.name || '').toLowerCase();
        const clientCompanyLower = (client.company || '').toLowerCase();
        const nameRegioMatch = applicantRegios.some((ar: string) => 
          clientNameLower.includes(ar) || clientCompanyLower.includes(ar)
        );
        
        // Use best regio score
        let regioScore = regioResult.score;
        let regioReason = regioResult.reason;
        let regioMatchType = regioResult.matchType;
        
        if (regioResult.matchType === 'none' && nameRegioMatch) {
          regioScore = 20;
          regioReason = 'Regio gevonden in klantnaam';
          regioMatchType = 'exact';
        }
        
        score += regioScore;
        if (regioScore > 0) {
          reasons.push(regioReason);
        }
        
        // Use shared SECTOR_SIMILARITY from constants
        
        const clientSectors = client.sector || [];
        const applicantSectors = extractedData.ervaring_sector || [];
        
        const directSectorMatches = clientSectors.filter((s: string) => 
          applicantSectors.includes(s)
        );
        
        const relatedSectorMatches: string[] = [];
        let relatedSectorScore = 0;
        applicantSectors.forEach((appS: string) => {
          const relation = SECTOR_SIMILARITY[appS];
          if (relation) {
            const relatedFound = relation.related.filter((relS: string) =>
              clientSectors.includes(relS)
            );
            if (relatedFound.length > 0 && !directSectorMatches.includes(appS)) {
              relatedSectorMatches.push(...relatedFound);
              relatedSectorScore += relation.similarity * relatedFound.length;
            }
          }
        });
        
        const totalSectorWeight = directSectorMatches.length * 1.0 + relatedSectorScore;
        const maxSectorWeight = clientSectors.length * 1.0;
        const sectorMatchPercentage = maxSectorWeight > 0 ? totalSectorWeight / maxSectorWeight : 0;
        const sectorScore = Math.round(sectorMatchPercentage * 25);
        
        if (directSectorMatches.length > 0 || relatedSectorMatches.length > 0) {
          score += sectorScore;
          if (directSectorMatches.length > 0) {
            reasons.push(`${directSectorMatches.length} sector(en) exact match`);
          }
          if (relatedSectorMatches.length > 0) {
            reasons.push(`${[...new Set(relatedSectorMatches)].length} gerelateerde sector(en)`);
          }
        }
        
        const clientDoelgroepen = client.doelgroep || [];
        const applicantDoelgroepen = extractedData.doelgroep_ervaring || [];
        const doelgroepOverlap = clientDoelgroepen.filter((d: string) => 
          applicantDoelgroepen.includes(d)
        ).length;
        if (doelgroepOverlap > 0) {
          const doelgroepScore = Math.min(20, doelgroepOverlap * 8);
          score += doelgroepScore;
          reasons.push(`${doelgroepOverlap} doelgroep(en) match`);
        }
        
        const clientFuncties = client.gezochte_functies || [];
        const applicantFunctie = extractedData.functie_niveau;
        const functieMatch = functieMatchesAny(applicantFunctie, clientFuncties);
        if (functieMatch) {
          score += 15;
          reasons.push('Functieniveau match');
        }
        
        const clientOrgId = client.org_id;
        const clientOrgName = clientOrgId === '550e8400-e29b-41d4-a716-446655440000' ? 'ABCzorg' : 'CitoZorg';
        const applicantOrg = extractedData.assigned_organization;
        if (applicantOrg && clientOrgName === applicantOrg) {
          score += 10;
          reasons.push('Zelfde bureau');
        }
        
        // NIEUW: Ervaring bonus
        const jarenErvaring = extractedData.jaren_ervaring;
        const ervaringResult = calculateErvaringBonus(jarenErvaring);
        if (ervaringResult.bonus !== 0) {
          score += ervaringResult.bonus;
          if (ervaringResult.bonus > 0) {
            reasons.push(`Ervaring bonus: ${ervaringResult.label}`);
          }
        }
        
        // NIEUW: Leidinggevende bonus
        if (extractedData.leidinggevende_ervaring) {
          score += LEIDINGGEVENDE_BONUS;
          reasons.push('Leidinggevende ervaring');
        }
        
        // NIEUW: Postcode afstand matching
        const applicantPostcode = extractedData.postcode;
        const clientRegio = client.regio?.[0] || '';
        if (applicantPostcode && clientRegio) {
          const postcodePrefix = applicantPostcode.substring(0, 2);
          const postcodeRegioMap: Record<string, string[]> = {
            '10': ['Noord-Holland'], '11': ['Noord-Holland'], '12': ['Noord-Holland'], '13': ['Noord-Holland'], '14': ['Noord-Holland'], '15': ['Noord-Holland'], '16': ['Noord-Holland'], '17': ['Noord-Holland'], '18': ['Noord-Holland'], '19': ['Noord-Holland'], '20': ['Noord-Holland'],
            '21': ['Zuid-Holland'], '22': ['Zuid-Holland'], '23': ['Zuid-Holland'], '24': ['Zuid-Holland'], '25': ['Zuid-Holland'], '26': ['Zuid-Holland'], '27': ['Zuid-Holland'], '28': ['Zuid-Holland'], '29': ['Zuid-Holland'],
            '30': ['Utrecht'], '31': ['Utrecht'], '32': ['Utrecht'], '33': ['Utrecht'], '34': ['Utrecht'], '35': ['Gelderland'], '36': ['Gelderland'], '37': ['Overijssel'],
            '40': ['Gelderland'], '41': ['Gelderland'], '42': ['Gelderland'], '43': ['Gelderland'],
            '50': ['Noord-Brabant'], '51': ['Noord-Brabant'], '52': ['Noord-Brabant'], '53': ['Noord-Brabant'], '54': ['Noord-Brabant'], '55': ['Noord-Brabant'], '56': ['Noord-Brabant'], '57': ['Noord-Brabant'], '58': ['Noord-Brabant'], '59': ['Limburg'],
            '60': ['Limburg'], '61': ['Limburg'], '62': ['Limburg'], '63': ['Limburg'], '64': ['Limburg'],
            '70': ['Overijssel'], '71': ['Overijssel'], '72': ['Overijssel'], '73': ['Overijssel'], '74': ['Overijssel'], '75': ['Overijssel'], '76': ['Drenthe'], '77': ['Drenthe'], '78': ['Drenthe'], '79': ['Drenthe'],
            '80': ['Friesland'], '81': ['Friesland'], '82': ['Friesland'], '83': ['Friesland'], '84': ['Friesland'], '85': ['Friesland'], '86': ['Friesland'], '87': ['Friesland'], '88': ['Friesland'], '89': ['Groningen'],
            '90': ['Groningen'], '91': ['Groningen'], '92': ['Groningen'], '93': ['Groningen'], '94': ['Groningen'], '95': ['Groningen'], '96': ['Groningen'], '97': ['Groningen'], '98': ['Groningen'], '99': ['Groningen'],
          };
          const postcodeProvincie = postcodeRegioMap[postcodePrefix]?.[0];
          if (postcodeProvincie && clientRegio.toLowerCase().includes(postcodeProvincie.toLowerCase())) {
            score += 5;
            reasons.push(`Postcode match (${postcodeProvincie})`);
          }
        }
        
        // NIEUW: Dienstvorm matching (nacht/weekend)
        if (extractedData.nachtdienst_bereid === true) {
          score += 3;
          reasons.push('Beschikbaar voor nachtdienst');
        }
        if (extractedData.weekenddienst_bereid === true) {
          score += 3;
          reasons.push('Beschikbaar voor weekenddienst');
        }
        
        // NIEUW: Certificaten bonus
        const applicantCertificaten = extractedData.certificaten || [];
        if (Array.isArray(applicantCertificaten) && applicantCertificaten.length > 0) {
          const certBonus = Math.min(5, applicantCertificaten.length * 2);
          score += certBonus;
          reasons.push(`${applicantCertificaten.length} certificaat/certificaten`);
        }
        
        const breakdown = {
          regio: {
            score: regioScore,
            match: regioMatchType !== 'none',
            reason: regioReason,
            matchType: regioMatchType
          },
          sector: {
            score: sectorScore,
            match: directSectorMatches.length > 0 || relatedSectorMatches.length > 0,
            reason: directSectorMatches.length > 0 
              ? `${directSectorMatches.length} sector(en) exact match` 
              : relatedSectorMatches.length > 0
                ? `${[...new Set(relatedSectorMatches)].length} gerelateerde sector(en) (${Math.round(sectorMatchPercentage * 100)}%)`
                : 'Geen sector overlap',
            directMatches: directSectorMatches,
            relatedMatches: [...new Set(relatedSectorMatches)]
          },
          doelgroep: {
            score: doelgroepOverlap > 0 ? Math.min(20, doelgroepOverlap * 8) : 0,
            match: doelgroepOverlap > 0,
            reason: doelgroepOverlap > 0 
              ? `${doelgroepOverlap} doelgroep(en) komen overeen` 
              : 'Geen doelgroep overlap'
          },
          functie: {
            score: functieMatch ? 15 : 0,
            match: functieMatch,
            reason: functieMatch
              ? 'Functieniveau wordt gezocht'
              : 'Functieniveau niet gezocht (controleer variaties)'
          },
          bureau: {
            score: (applicantOrg && clientOrgName === applicantOrg) ? 10 : 0,
            match: applicantOrg && clientOrgName === applicantOrg,
            reason: (applicantOrg && clientOrgName === applicantOrg)
              ? 'Zelfde bemiddelingsbureau'
              : 'Ander bemiddelingsbureau'
          }
        };
        
        return { 
          ...client, 
          matchScore: Math.round((score / MAX_POSSIBLE_SCORE) * 100), // True normalization
          matchReasons: reasons,
          orgName: clientOrgName,
          scoreBreakdown: breakdown
        };
      });
      
      const topMatches = scored
        .filter(c => c.matchScore >= 10)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 5);
      
      setMatchedClients(topMatches);
      
      if (topMatches.length === 0) {
        toast.info("Geen passende klanten gevonden");
      }
    } catch (error) {
      console.error('Error finding matching clients:', error);
      toast.error("Fout bij zoeken naar passende klanten");
    } finally {
      setMatchingLoading(false);
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
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3">
              <Mail className="h-5 w-5" />
              Sollicitatie Details
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Verwijderen
            </Button>
          </div>
        </DialogHeader>

        {/* Header Metadata */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-lg font-semibold">{application.email_from}</p>
              {application.email_subject && (
                <p className="text-sm text-muted-foreground">{application.email_subject}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Badge variant="outline">{getStageLabel(application.pipeline_stage)}</Badge>
              <Badge variant="outline">{getStatusLabel(application.status)}</Badge>
            </div>
          </div>

          {/* Organization Badge */}
          {getFieldValue(application.extracted_data?.assigned_organization) && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/20 border border-blue-200">
              <Building2 className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                {getFieldValue(application.extracted_data?.assigned_organization)}
              </span>
            </div>
          )}
        </div>

        <Separator />

        {/* Tabbed Interface */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overzicht</TabsTrigger>
            <TabsTrigger value="actions">Acties & Matching</TabsTrigger>
            <TabsTrigger value="activity">Activiteit</TabsTrigger>
          </TabsList>

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

                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="eigen_vervoer_edit"
                            checked={editData.eigen_vervoer}
                            onCheckedChange={(checked) => setEditData({ ...editData, eigen_vervoer: checked as boolean })}
                          />
                          <Label htmlFor="eigen_vervoer_edit" className="cursor-pointer text-sm">
                            Eigen vervoer beschikbaar
                          </Label>
                        </div>

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
                        {getFieldValue(application.extracted_data?.regio) && (
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">Regio: {getFieldValue(application.extracted_data?.regio)}</span>
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
                            {getFieldValue(application.extracted_data?.eigen_vervoer) && (
                              <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">Auto ✓</Badge>
                            )}
                            {getFieldValue(application.extracted_data?.rijbewijs) && !getFieldValue(application.extracted_data?.eigen_vervoer) && (
                              <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-300">Rijbewijs ✓</Badge>
                            )}
                            {getFieldValue(application.extracted_data?.max_reisafstand_km) && (
                              <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">Max {getFieldValue(application.extracted_data?.max_reisafstand_km)}km</Badge>
                            )}
                            {!getFieldValue(application.extracted_data?.eigen_vervoer) && !getFieldValue(application.extracted_data?.rijbewijs) && (
                              <span className="text-sm text-muted-foreground">Geen info</span>
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

            {/* CV Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  CV Document
                </span>
              </div>
              
              {application.cv_file_path ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {application.cv_file_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCVView}
                      title="Bekijken"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCVDownload}
                      disabled={downloadingCV}
                      title="Downloaden"
                    >
                      {downloadingCV ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCVDelete}
                      className="text-destructive hover:text-destructive"
                      title="Verwijderen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <input
                    type="file"
                    id="cv-upload"
                    accept=".pdf"
                    onChange={handleCVUpload}
                    className="hidden"
                    disabled={uploadingCV}
                  />
                  <label
                    htmlFor="cv-upload"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    {uploadingCV ? (
                      <>
                        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                        <span className="text-sm text-muted-foreground">Uploaden...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm font-medium">Klik om CV te uploaden</span>
                        <span className="text-xs text-muted-foreground">
                          PDF, maximaal 10MB
                        </span>
                      </>
                    )}
                  </label>
                </div>
              )}
            </div>

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
                onClick={() => {
                  setActionType("interview");
                  setShowActionForm(true);
                }}
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

            <Separator />

            {/* Client Matching */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  ✨ Passende Klanten
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={findMatchingClients}
                  disabled={matchingLoading}
                >
                  {matchingLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Zoeken...
                    </>
                  ) : (
                    "Zoek Matches"
                  )}
                </Button>
              </div>

              {showMatches && (
                <>
                  {matchingLoading ? (
                    <div className="text-sm text-muted-foreground">Zoeken naar passende klanten...</div>
                  ) : matchedClients.length > 0 ? (
                    <>
                      {/* AI Match Insights */}
                      <AIMatchInsights 
                        functieNiveau={application.extracted_data?.functie_niveau}
                        sector={application.extracted_data?.ervaring_sector}
                        doelgroep={application.extracted_data?.doelgroep_ervaring}
                      />
                      
                      <div className="text-xs text-muted-foreground flex items-center gap-2 pb-2">
                        📍 Op basis van: {application.extracted_data?.regio || 'Regio'} • {application.extracted_data?.functie_niveau || 'Functieniveau'} • {(application.extracted_data?.ervaring_sector || []).slice(0, 2).join('/')}
                      </div>
                      <div className="space-y-3">
                        {matchedClients.map((client) => (
                          <div
                            key={client.id}
                            className="p-4 rounded-lg border bg-card hover:bg-accent/30 transition-colors space-y-2"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                  <p className="text-sm font-semibold">{client.name}</p>
                                  <Badge variant="default" className="text-xs">
                                    {client.matchScore}% match
                                  </Badge>
                                </div>
                                
                                <div className="text-xs text-muted-foreground space-y-1">
                                  {client.sector && client.sector.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      <span className="font-medium">Sector:</span>
                                      <span>{client.sector.join(', ')}</span>
                                    </div>
                                  )}
                                  {client.doelgroep && client.doelgroep.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      <span className="font-medium">Doelgroep:</span>
                                      <span>{client.doelgroep.join(', ')}</span>
                                    </div>
                                  )}
                                  {client.regio && client.regio.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      <span className="font-medium">Regio:</span>
                                      <span>{client.regio.join(', ')}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1">
                                    <span className="font-medium">Bureau:</span>
                                    <Badge variant="outline" className="text-xs">
                                      {client.orgName}
                                    </Badge>
                                  </div>
                                </div>

                                {client.matchReasons && client.matchReasons.length > 0 && (
                                  <div className="flex flex-wrap gap-1 pt-1">
                                    {client.matchReasons.map((reason: string, idx: number) => (
                                      <Badge key={idx} variant="secondary" className="text-xs">
                                        ✓ {reason}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex gap-2 pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  window.location.href = `/klanten`;
                                }}
                              >
                                Bekijk Klant
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => {
                                  toast.info("Direct koppelen functionaliteit komt binnenkort");
                                }}
                              >
                                Direct Koppelen
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2 p-3 rounded-lg bg-muted/30">
                      <p className="text-sm text-muted-foreground">
                        Geen passende klanten gevonden
                      </p>
                      <p className="text-sm text-amber-600">
                        💡 Tip: Voeg regio's en sectoren toe aan klanten voor betere matching.{" "}
                        <Button 
                          variant="link" 
                          className="h-auto p-0 text-amber-600 hover:text-amber-700"
                          onClick={() => window.location.href = '/klanten'}
                        >
                          Naar Klanten →
                        </Button>
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
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

            <Separator />

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
                {["nieuw", "screening", "interview", "goedgekeurd", "geplaatst", "afgewezen"].map((stage) => (
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
    </Dialog>
  );
}