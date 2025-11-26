import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, User, FileText, Calendar, AlertCircle, CheckCircle2, Clock, Phone, CalendarClock, ClipboardCheck, Plus, ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";

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
  const [creatingAction, setCreatingAction] = useState(false);

  // Load linked tasks
  useEffect(() => {
    if (application?.id && open) {
      loadLinkedTasks();
    }
  }, [application?.id, open]);

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
      const { error } = await supabase
        .from("professional_applications")
        .update({ 
          pipeline_stage: newStage,
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

  const handleCreateAction = async () => {
    if (!application?.id) return;

    // Validate action preconditions
    if (actionType === "call" && !application.extracted_data?.telefoonnummer) {
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
      }]);

      if (error) throw error;

      toast.success("Actie aangemaakt");
      
      // Reset form
      setShowActionForm(false);
      setCustomTitle("");
      setActionNotes("");
      setActionType("call");
      setActionPriority("MEDIUM");
      
      // Reload tasks
      loadLinkedTasks();
    } catch (error) {
      console.error('Error creating action:', error);
      toast.error("Fout bij aanmaken actie");
    } finally {
      setCreatingAction(false);
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
              <p className="text-sm font-semibold">Contactgegevens</p>
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
                {application.extracted_data?.telefoonnummer && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a 
                      href={`tel:${application.extracted_data.telefoonnummer}`}
                      className="text-sm text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {application.extracted_data.telefoonnummer}
                    </a>
                  </div>
                )}
                {!application.extracted_data?.telefoonnummer && (
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

          {/* CV File */}
          {application.cv_file_name && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{application.cv_file_name}</span>
            </div>
          )}

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

            {/* Quick Action Buttons */}
            {!showActionForm && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!application.extracted_data?.telefoonnummer}
                  onClick={() => {
                    setActionType("call");
                    setShowActionForm(true);
                  }}
                  title={!application.extracted_data?.telefoonnummer ? "Voeg eerst telefoonnummer toe" : ""}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Bel kandidaat
                  {!application.extracted_data?.telefoonnummer && (
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
                            <span>• Deadline: {format(new Date(task.due_at), "d MMM", { locale: nl })}</span>
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
