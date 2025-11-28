import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, User, FileText, ArrowRight, Edit, ListChecks, Mail, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { TaskDialog } from "./TaskDialog";
import { ProcessTimeline } from "./ProcessTimeline";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Subtask {
  id: string;
  title: string;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  order: number;
  due_at: string | null;
  assignee_id: string | null;
  profiles: {
    name: string | null;
    email: string | null;
  } | null;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  start_at: string | null;
  due_at: string | null;
  next_action: string | null;
  assignee_id: string | null;
  application_id: string | null;
  recruitment_action_type: string | null;
  profiles: {
    name: string | null;
    email: string | null;
  } | null;
}

interface LinkedApplication {
  id: string;
  email_from: string;
  pipeline_stage: string;
  professionals: {
    full_name: string;
  } | null;
}

interface TaskDetailModalProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdated: () => void;
}

const priorityConfig = {
  LOW: { label: "Laag", variant: "outline" as const, color: "bg-priority-low" },
  MEDIUM: { label: "Normaal", variant: "secondary" as const, color: "bg-priority-medium" },
  HIGH: { label: "Hoog", variant: "default" as const, color: "bg-priority-high" },
  CRITICAL: { label: "Kritiek", variant: "destructive" as const, color: "bg-priority-critical" },
};

export function TaskDetailModal({ task, open, onOpenChange, onTaskUpdated }: TaskDetailModalProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loadingSubtasks, setLoadingSubtasks] = useState(false);
  const [linkedApplication, setLinkedApplication] = useState<LinkedApplication | null>(null);
  const [loadingApplication, setLoadingApplication] = useState(false);
  const { toast } = useToast();

  // Load subtasks and application when task changes
  useEffect(() => {
    if (task?.id && open) {
      loadSubtasks();
      
      // Load linked application if exists
      if (task.application_id) {
        loadLinkedApplication();
      } else {
        setLinkedApplication(null);
      }
      
      // Subscribe to realtime updates
      const channel = supabase
        .channel(`subtasks-${task.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'subtasks',
            filter: `task_id=eq.${task.id}`
          },
          () => {
            loadSubtasks();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [task?.id, task?.application_id, open]);

  const loadLinkedApplication = async () => {
    if (!task?.application_id) return;
    
    setLoadingApplication(true);
    try {
      const { data, error } = await supabase
        .from('professional_applications')
        .select(`
          id,
          email_from,
          pipeline_stage,
          professionals:professional_id(full_name)
        `)
        .eq('id', task.application_id)
        .single();

      if (error) throw error;
      setLinkedApplication(data);
    } catch (error) {
      console.error('Error loading linked application:', error);
    } finally {
      setLoadingApplication(false);
    }
  };

  const loadSubtasks = async () => {
    if (!task?.id) return;
    
    setLoadingSubtasks(true);
    try {
      const { data, error } = await supabase
        .from('subtasks')
        .select(`
          *,
          profiles:assignee_id(name, email)
        `)
        .eq('task_id', task.id)
        .order('order', { ascending: true });

      if (error) throw error;
      setSubtasks(data || []);
    } catch (error) {
      console.error('Error loading subtasks:', error);
      toast({
        title: "Fout bij laden processtappen",
        description: "Kon processtappen niet laden",
        variant: "destructive"
      });
    } finally {
      setLoadingSubtasks(false);
    }
  };

  const handleCompleteStep = async (subtaskId: string) => {
    try {
      const { error } = await supabase
        .from('subtasks')
        .update({ status: 'completed' })
        .eq('id', subtaskId);

      if (error) throw error;

      toast({
        title: "Stap voltooid",
        description: "Processtap is afgerond"
      });
    } catch (error) {
      console.error('Error completing step:', error);
      toast({
        title: "Fout",
        description: "Kon stap niet voltooien",
        variant: "destructive"
      });
    }
  };

  const handleSkipStep = async (subtaskId: string) => {
    try {
      const { error } = await supabase
        .from('subtasks')
        .update({ status: 'skipped' })
        .eq('id', subtaskId);

      if (error) throw error;

      toast({
        title: "Stap overgeslagen",
        description: "Processtap is overgeslagen"
      });
    } catch (error) {
      console.error('Error skipping step:', error);
      toast({
        title: "Fout",
        description: "Kon stap niet overslaan",
        variant: "destructive"
      });
    }
  };

  const handleResetStep = async (subtaskId: string) => {
    try {
      const { error } = await supabase
        .from('subtasks')
        .update({ status: 'pending' })
        .eq('id', subtaskId);

      if (error) throw error;

      toast({
        title: "Stap teruggezet",
        description: "Processtap is teruggezet naar pending"
      });
    } catch (error) {
      console.error('Error resetting step:', error);
      toast({
        title: "Fout",
        description: "Kon stap niet terugzetten",
        variant: "destructive"
      });
    }
  };

  if (!task) return null;

  const priorityInfo = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.MEDIUM;

  const handleEdit = () => {
    setEditDialogOpen(true);
  };

  const handleEditSuccess = () => {
    setEditDialogOpen(false);
    onTaskUpdated();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <DialogTitle className="text-2xl font-bold">{task.title}</DialogTitle>
                <DialogDescription className="sr-only">
                  Details en processtappen voor deze taak
                </DialogDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Bewerken
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-6">
            {/* Linked Application Badge */}
            {linkedApplication && (
              <div className="p-4 border rounded-lg bg-accent/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Gekoppeld aan sollicitatie</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      window.location.href = `/sollicitaties?application=${linkedApplication.id}`;
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-medium">
                    {linkedApplication.professionals?.full_name || linkedApplication.email_from}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {linkedApplication.pipeline_stage}
                  </Badge>
                </div>
                {task.recruitment_action_type && (
                  <p className="text-xs text-muted-foreground">
                    Type: {task.recruitment_action_type}
                  </p>
                )}
              </div>
            )}

            {/* Priority */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Prioriteit:</span>
              <Badge variant={priorityInfo.variant}>{priorityInfo.label}</Badge>
            </div>

            {/* Assignee */}
            {task.profiles && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Toegewezen aan:</span>
                <span className="text-sm">{task.profiles.name || task.profiles.email}</span>
              </div>
            )}

            {/* Dates */}
            <div className="space-y-2">
              {task.start_at && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Start:</span>
                  <span className="text-sm">
                    {format(parseISO(task.start_at), "EEEE d MMMM yyyy 'om' HH:mm", { locale: nl })}
                  </span>
                </div>
              )}
              {task.due_at && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Deadline:</span>
                  <span className="text-sm">
                    {format(parseISO(task.due_at), "EEEE d MMMM yyyy 'om' HH:mm", { locale: nl })}
                  </span>
                </div>
              )}
            </div>

            {/* Description */}
            {task.description && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Beschrijving:</span>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm whitespace-pre-wrap">{task.description}</p>
                </div>
              </div>
            )}

            {/* Next Action */}
            {task.next_action && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Volgende actie:</span>
                </div>
                <div className="bg-primary/10 border-l-4 border-primary rounded-lg p-4">
                  <p className="text-sm font-medium">{task.next_action}</p>
                </div>
              </div>
            )}

            {/* Process Steps */}
            {subtasks.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Processtappen:</span>
                </div>
                {loadingSubtasks ? (
                  <div className="text-sm text-muted-foreground">Laden...</div>
                ) : (
                  <ProcessTimeline 
                    subtasks={subtasks}
                    onCompleteStep={handleCompleteStep}
                    onSkipStep={handleSkipStep}
                    onResetStep={handleResetStep}
                  />
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <TaskDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleEditSuccess}
        taskId={task.id}
      />
    </>
  );
}
