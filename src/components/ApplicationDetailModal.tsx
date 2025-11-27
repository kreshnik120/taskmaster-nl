import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, User, FileText, Calendar, AlertCircle, CheckCircle2, Clock, Phone, CalendarClock, ClipboardCheck, Plus, ExternalLink, Loader2, X, Upload, Download, Eye, Trash2, Building2, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { convertApplicationToProfessional } from "@/lib/convertApplicationToProfessional";

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

export function ApplicationDetailModal({
  application,
  open,
  onOpenChange,
  onApplicationUpdated,
}: ApplicationDetailModalProps) {
  const [updating, setUpdating] = useState(false);
  const [linkedTasks, setLinkedTasks] = useState<LinkedTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  
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
        telefoon: application.extracted_data?.telefoon || "",
        regio: application.extracted_data?.regio || "",
        functie_niveau: application.extracted_data?.functie_niveau || "",
        werkvorm: application.extracted_data?.werkvorm || "",
        beschikbaarheid: application.extracted_data?.beschikbaarheid || "",
        ervaring_sector: application.extracted_data?.ervaring_sector || [],
        doelgroep_ervaring: application.extracted_data?.doelgroep_ervaring || [],
        eigen_vervoer: application.extracted_data?.eigen_vervoer || false,
        bron: application.extracted_data?.bron || "",
        opmerkingen: application.extracted_data?.opmerkingen || "",
        assigned_organization: application.extracted_data?.assigned_organization || "",
      });
    }
  }, [application, editMode]);

  const loadLinkedTasks = async () => {
    if (!application?.id) return;
    
    setLoadingTasks(true);
    try {
      // Fetch tasks without join to avoid ambiguity
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('id, title, status, priority, due_at, recruitment_action_type, assignee_id')
        .eq('application_id', application.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;

      // Fetch profile names for assignees
      const assigneeIds = tasksData?.map(t => t.assignee_id).filter(Boolean) || [];
      let profilesMap = new Map();

      if (assigneeIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', assigneeIds);

        profilesData?.forEach(p => profilesMap.set(p.id, p));
      }

      // Map tasks with profile data
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
      // Map pipeline_stage to status (same mapping as handleDragEnd)
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

  // Constants for dropdowns and badges
  const SECTOREN = [
    "VVT",
    "GGZ", 
    "GHZ",
    "Jeugdzorg",
    "Ziekenhuis/Klinisch",
    "Thuiszorg",
  ];

  const DOELGROEPEN = [
    "Ouderen",
    "LVB",
    "Psychiatrie",
    "Somatiek",
    "Kinderen/Jeugd",
    "Verslaving",
  ];

  const BESCHIKBAARHEDEN = [
    "<24 uur/week",
    "24-32 uur/week",
    "32-40 uur/week",
    "Flexibel",
  ];

  const BRONNEN = [
    "Indeed",
    "LinkedIn",
    "Eigen netwerk",
    "Website",
    "Referral",
    "Telefonisch",
    "Anders",
  ];

  const ORGANISATIES = ["ABCzorg", "CitoZorg"];

  // Toggle functions for multi-select badges
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
      // Merge edit data with existing extracted_data
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

      // Calculate completeness score
      const fields = {
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

      const weights = {
        naam: 15,
        email: 15,
        functie_niveau: 20,
        werkvorm: 15,
        regio: 10,
        telefoon: 10,
        ervaring_sector: 5,
        beschikbaarheid: 5,
        doelgroep_ervaring: 5,
      };

      let score = 0;
      Object.entries(fields).forEach(([key, value]) => {
        if (value && (Array.isArray(value) ? value.length > 0 : true)) {
          score += weights[key as keyof typeof weights] || 0;
        }
      });

      const completeness_score = Math.round(score);

      // Update application
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
    
    // Validatie: alleen PDF, max 10MB
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
      // Genereer unieke bestandsnaam
      const filePath = `${application.id}/${Date.now()}_${file.name}`;
      
      // Upload naar Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('application-cvs')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      // Update database record
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
      
      // Trigger browser download
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
      // Verwijder uit storage
      const { error: deleteError } = await supabase.storage
        .from('application-cvs')
        .remove([application.cv_file_path]);
      
      if (deleteError) throw deleteError;
      
      // Update database
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

    // Validate action preconditions
    if (actionType === "call" && !application.extracted_data?.telefoon) {
      toast.error("Telefoonnummer is vereist om deze actie aan te maken");
      return;
    }

    // Determine title based on action type
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
      // Get current user and org
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: orgData } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) throw new Error("No organization found");

      // Combine date and time if both are set
      let dueAt = null;
      if (actionDueDate) {
        const [hours, minutes] = actionDueTime.split(':').map(Number);
        const combined = new Date(actionDueDate);
        combined.setHours(hours, minutes, 0, 0);
        dueAt = combined.toISOString();
      }

      // Create task linked to application
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
      
      // Reset form
      setShowActionForm(false);
      setCustomTitle("");
      setActionNotes("");
      setActionType("call");
      setActionPriority("MEDIUM");
      setActionDueDate(undefined);
      setActionDueTime("09:00");
      
      // Reload tasks
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
      
      // Normalize applicant regions
      const applicantRegios = (extractedData.regio || '')
        .toLowerCase()
        .split(',')
        .map((r: string) => r.trim())
        .filter(Boolean);

      const scored = clients.map(client => {
        let score = 0;
        let reasons: string[] = [];
        
        // Regio matching (30% voor exacte match, 20% voor naam-match)
        const clientRegios = (client.regio || []).map((r: string) => r.toLowerCase());
        const regioMatch = clientRegios.some((cr: string) => 
          applicantRegios.some((ar: string) => ar.includes(cr) || cr.includes(ar))
        );
        if (regioMatch && clientRegios.length > 0) {
          score += 30;
          reasons.push('Regio match');
        } else {
          // Fallback: check of sollicitant regio voorkomt in klantnaam
          const clientNameLower = (client.name || '').toLowerCase();
          const clientCompanyLower = (client.company || '').toLowerCase();
          const nameRegioMatch = applicantRegios.some((ar: string) => 
            clientNameLower.includes(ar) || clientCompanyLower.includes(ar)
          );
          if (nameRegioMatch) {
            score += 20;
            reasons.push('Regio in klantnaam');
          }
        }
        
        // Sector matching (25%)
        const clientSectors = client.sector || [];
        const applicantSectors = extractedData.ervaring_sector || [];
        const sectorOverlap = clientSectors.filter((s: string) => 
          applicantSectors.includes(s)
        ).length;
        if (sectorOverlap > 0) {
          const sectorScore = Math.min(25, sectorOverlap * 10);
          score += sectorScore;
          reasons.push(`${sectorOverlap} sector(en) match`);
        }
        
        // Doelgroep matching (20%)
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
        
        // Functieniveau matching (15%)
        const clientFuncties = client.gezochte_functies || [];
        const applicantFunctie = extractedData.functie_niveau;
        if (applicantFunctie && clientFuncties.includes(applicantFunctie)) {
          score += 15;
          reasons.push('Functieniveau match');
        }
        
        // Bemiddelingsbureau matching (10%) - altijd als bonus
        const clientOrgId = client.org_id;
        const clientOrgName = clientOrgId === '650e8400-e29b-41d4-a716-446655440000' ? 'ABCzorg' : 'CitoZorg';
        const applicantOrg = extractedData.assigned_organization;
        if (applicantOrg && clientOrgName === applicantOrg) {
          score += 10;
          reasons.push('Zelfde bureau');
        }
        
        return { 
          ...client, 
          matchScore: Math.round(score), 
          matchReasons: reasons,
          orgName: clientOrgName 
        };
      });
      
      // Sort by score, take top 5 with score >= 10
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Mail className="h-5 w-5" />
            Sollicitatie Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header Info */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <p className="text-lg font-semibold">{application.email_from}</p>
                {application.email_subject && (
                  <p className="text-sm text-muted-foreground">{application.email_subject}</p>
                )}
              </div>
              <Badge variant="outline" className="shrink-0">
                {getStatusLabel(application.status)}
              </Badge>
            </div>

            {/* Contactgegevens Section */}
            <div className="p-4 rounded-lg bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Contactgegevens</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditMode(!editMode)}
                >
                  {editMode ? "Annuleren" : "Bewerk"}
                </Button>
              </div>
              
              {editMode ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Telefoonnummer</label>
                    <Input
                      placeholder="06..."
                      value={editData.telefoon}
                      onChange={(e) => setEditData({ ...editData, telefoon: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Regio</label>
                    <Input
                      placeholder="Utrecht, Amsterdam..."
                      value={editData.regio}
                      onChange={(e) => setEditData({ ...editData, regio: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Functieniveau</label>
                    <Select 
                      value={editData.functie_niveau} 
                      onValueChange={(value) => setEditData({ ...editData, functie_niveau: value })}
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
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Werkvorm</label>
                    <Select 
                      value={editData.werkvorm} 
                      onValueChange={(value) => setEditData({ ...editData, werkvorm: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecteer werkvorm" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ZZP">ZZP</SelectItem>
                        <SelectItem value="Uitzendkracht">Uitzendkracht</SelectItem>
                        <SelectItem value="ABCito constructie">ABCito constructie</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator className="my-4" />

                  {/* Professionele Achtergrond */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground">Professionele Achtergrond</p>
                    
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Ervaring sector</label>
                      <div className="flex flex-wrap gap-1.5">
                        {SECTOREN.map((sector) => (
                          <Badge
                            key={sector}
                            variant={editData.ervaring_sector.includes(sector) ? "default" : "outline"}
                            className="cursor-pointer text-xs"
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

                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Doelgroep ervaring</label>
                      <div className="flex flex-wrap gap-1.5">
                        {DOELGROEPEN.map((dg) => (
                          <Badge
                            key={dg}
                            variant={editData.doelgroep_ervaring.includes(dg) ? "default" : "outline"}
                            className="cursor-pointer text-xs"
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
                  </div>

                  <Separator className="my-4" />

                  {/* Werkvorm & Beschikbaarheid */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground">Werkvorm & Beschikbaarheid</p>
                    
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Beschikbaarheid</label>
                      <Select 
                        value={editData.beschikbaarheid} 
                        onValueChange={(value) => setEditData({ ...editData, beschikbaarheid: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecteer beschikbaarheid" />
                        </SelectTrigger>
                        <SelectContent>
                          {BESCHIKBAARHEDEN.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="eigen_vervoer_edit"
                        checked={editData.eigen_vervoer}
                        onCheckedChange={(checked) => setEditData({ ...editData, eigen_vervoer: checked as boolean })}
                      />
                      <label htmlFor="eigen_vervoer_edit" className="text-xs cursor-pointer">
                        Eigen vervoer beschikbaar
                      </label>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  {/* Bron & Opmerkingen */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground">Bron & Opmerkingen</p>
                    
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Bron sollicitatie</label>
                      <Select 
                        value={editData.bron} 
                        onValueChange={(value) => setEditData({ ...editData, bron: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecteer bron" />
                        </SelectTrigger>
                        <SelectContent>
                          {BRONNEN.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Opmerkingen</label>
                      <Textarea
                        placeholder="Aanvullende opmerkingen..."
                        value={editData.opmerkingen}
                        onChange={(e) => setEditData({ ...editData, opmerkingen: e.target.value })}
                        rows={3}
                      />
                    </div>
                  </div>

                  <Separator className="my-4" />

                  {/* Bemiddelingsbureau Toewijzing */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground">Bemiddelingsbureau Toewijzing</p>
                    
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Inzet via bureau</label>
                      <Select 
                        value={editData.assigned_organization} 
                        onValueChange={(value) => setEditData({ ...editData, assigned_organization: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Kies ABCzorg of CitoZorg" />
                        </SelectTrigger>
                        <SelectContent>
                          {ORGANISATIES.map(org => (
                            <SelectItem key={org} value={org}>{org}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Via welk bureau wordt deze kandidaat bemiddeld?
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                    className="w-full mt-4"
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
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a 
                      href={`mailto:${application.email_from}`}
                      className="text-sm text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {application.email_from}
                    </a>
                  </div>
                  {application.extracted_data?.telefoon && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a 
                        href={`tel:${application.extracted_data.telefoon}`}
                        className="text-sm text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {application.extracted_data.telefoon}
                      </a>
                    </div>
                  )}
                  {!application.extracted_data?.telefoon && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Telefoonnummer niet bekend</span>
                    </div>
                  )}
                  {application.extracted_data?.regio && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Regio: {application.extracted_data.regio}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Professional Link */}
            {application.professionals && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{application.professionals.full_name}</p>
                  <p className="text-xs text-muted-foreground">{application.professionals.functie_niveau}</p>
                </div>
              </div>
            )}

            {/* Toegewezen Organisatie */}
            {application.extracted_data?.assigned_organization && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                <Building2 className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Inzet via</p>
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                    {application.extracted_data.assigned_organization}
                  </p>
                </div>
              </div>
            )}

            {/* Geen organisatie toegewezen indicator */}
            {!application.extracted_data?.assigned_organization && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-dashed">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-2">Bemiddelingsbureau nog niet gekozen</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleQuickOrganizationAssign("ABCzorg")}
                      disabled={updating}
                      className="border-blue-500 hover:bg-blue-500/10 text-xs"
                    >
                      {updating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      ABCzorg
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleQuickOrganizationAssign("CitoZorg")}
                      disabled={updating}
                      className="border-purple-500 hover:bg-purple-500/10 text-xs"
                    >
                      {updating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      CitoZorg
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
          </div>

          <Separator />

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

          {/* Extracted Data */}
          {application.extracted_data && Object.keys(application.extracted_data).length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>Geëxtraheerde gegevens</span>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 space-y-2 text-sm">
                {Object.entries(application.extracted_data).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}:</span>
                    <span className="font-medium">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CV Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                CV Document
              </span>
            </div>
            
            {application.cv_file_path ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
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

          {/* Email Body */}
          {application.email_body && (
            <div className="space-y-2">
              <span className="text-sm font-medium">E-mail inhoud</span>
              <div className="p-3 rounded-lg bg-muted/50 text-sm whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                {application.email_body}
              </div>
            </div>
          )}

          <Separator />

          {/* Actions Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Acties</span>
              {!showActionForm && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowActionForm(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Maak actie aan
                </Button>
              )}
            </div>

            {/* Convert to Professional - Only show when approved/placed and not yet converted */}
            {(application.pipeline_stage === 'goedgekeurd' || application.pipeline_stage === 'geplaatst') && 
             !application.professional_id && 
             (application.completeness_score || 0) >= 80 && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 mb-6">
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
                      Deze kandidaat is goedgekeurd en kan omgezet worden naar een professional profiel met alle gegevens.
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

            {/* Show linked professional if already converted */}
            {application.professional_id && application.professionals && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-blue-900">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="font-medium">
                      Gekoppeld aan professional: <strong>{application.professionals.full_name}</strong>
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="link"
                    onClick={() => {
                      window.location.href = `/professionals`;
                    }}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    Bekijk profiel →
                  </Button>
                </div>
              </div>
            )}

            {/* Quick Action Buttons */}
            {!showActionForm && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!application.extracted_data?.telefoon}
                  onClick={() => {
                    setActionType("call");
                    setShowActionForm(true);
                  }}
                  title={!application.extracted_data?.telefoon ? "Voeg eerst telefoonnummer toe" : ""}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Bel kandidaat
                  {!application.extracted_data?.telefoon && (
                    <AlertCircle className="h-3 w-3 ml-1 text-yellow-600" />
                  )}
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
                    setActionType("reference_check");
                    setShowActionForm(true);
                  }}
                >
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Check referenties
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={application.completeness_score === null || application.completeness_score < 100}
                  onClick={() => {
                    setActionType("contract");
                    setShowActionForm(true);
                  }}
                  title={application.completeness_score !== null && application.completeness_score < 100 ? "Profiel moet 100% compleet zijn" : ""}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Contract opmaken
                  {(application.completeness_score === null || application.completeness_score < 100) && (
                    <AlertCircle className="h-3 w-3 ml-1 text-yellow-600" />
                  )}
                </Button>
              </div>
            )}

            {/* Action Creation Form */}
            {showActionForm && (
              <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Actie type</label>
                  <Select value={actionType} onValueChange={setActionType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">📞 Bel kandidaat</SelectItem>
                      <SelectItem value="interview">📅 Plan interview</SelectItem>
                      <SelectItem value="reference_check">📋 Check referenties</SelectItem>
                      <SelectItem value="contract">📄 Contract opmaken</SelectItem>
                      <SelectItem value="custom">✏️ Aangepast</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {actionType === "custom" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Titel</label>
                    <Input
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="Bijv. Stuur informatiebrochure"
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
          </div>

          <Separator />

          {/* Client Matching Section */}
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
                                <p className="text-sm font-semibold">{client.company}</p>
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

          <Separator />

          {/* Linked Tasks */}
          {linkedTasks.length > 0 && (
            <div className="space-y-3">
              <span className="text-sm font-medium">Lopende acties ({linkedTasks.length})</span>
              <div className="space-y-2">
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
                          // Navigate to task - for now just show in Lijstweergave
                          window.location.href = `/lijst?task=${task.id}`;
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <Separator />

          {/* Pipeline Stage Actions */}
          <div className="space-y-3">
            <span className="text-sm font-medium">Verplaats naar:</span>
            <div className="flex flex-wrap gap-2">
              {["nieuw", "screening", "interview", "goedgekeurd", "geplaatst"].map((stage) => (
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
