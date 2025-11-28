import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import confetti from "canvas-confetti";
import { 
  Calendar, 
  Clock, 
  User, 
  FileText, 
  ArrowRight, 
  Edit, 
  ListChecks, 
  Mail, 
  ExternalLink,
  Play,
  Square,
  CheckCircle2,
  Bell,
  ChevronDown,
  Info
} from "lucide-react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { TaskDialog } from "./TaskDialog";
import { ReminderDialog } from "./ReminderDialog";
import { ProcessTimeline } from "./ProcessTimeline";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTaskTimer } from "@/hooks/useTaskTimer";

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
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [nextReminder, setNextReminder] = useState<any>(null);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState({
    info: true,
    description: true,
    steps: true
  });
  const { toast } = useToast();
  const { activeTimer, isLoading: timerLoading, elapsedTime, startTimer, stopTimer, isTimerActive } = useTaskTimer(task?.id || null);

  // Load subtasks and application when task changes
  useEffect(() => {
    if (task?.id && open) {
      loadSubtasks();
      loadNextReminder();
      
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

  const loadNextReminder = async () => {
    if (!task) return;

    try {
      const { data } = await supabase
        .from("reminders")
        .select("*")
        .eq("task_id", task.id)
        .gte("at", new Date().toISOString())
        .order("at", { ascending: true })
        .limit(1)
        .single();

      setNextReminder(data);
    } catch (error) {
      // No reminder found is okay
      setNextReminder(null);
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

  const handleConfirmComplete = async () => {
    if (!task?.id) return;
    
    setCompleting(true);
    setConfirmCompleteOpen(false);
    
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ 
          completed_at: new Date().toISOString(),
          status: 'DONE'
        })
        .eq('id', task.id);

      if (error) throw error;

      // 🎉 Confetti celebration!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      // Toast with undo option
      toast({
        title: "🎉 Taak afgerond!",
        description: task.title,
        action: (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => undoComplete(task.id)}
          >
            Ongedaan maken
          </Button>
        )
      });
      
      onOpenChange(false);
      onTaskUpdated();
    } catch (error) {
      console.error('Error completing task:', error);
      toast({
        title: "Fout",
        description: "Kon taak niet afronden",
        variant: "destructive"
      });
    } finally {
      setCompleting(false);
    }
  };

  const undoComplete = async (taskId: string) => {
    try {
      // Find the IN_PROGRESS column to restore the task
      const { data: column } = await supabase
        .from("columns")
        .select("id, status")
        .eq("status", "DOING")
        .maybeSingle();

      const { error } = await supabase
        .from('tasks')
        .update({ 
          completed_at: null, 
          status: column?.status || 'DOING',
          column_id: column?.id || undefined
        })
        .eq('id', taskId);

      if (error) throw error;
      
      toast({ 
        title: "Taak hersteld", 
        description: "Terug op je lijst" 
      });
      
      onTaskUpdated();
    } catch (error) {
      console.error('Error undoing complete:', error);
      toast({
        title: "Fout",
        description: "Kon taak niet herstellen",
        variant: "destructive"
      });
    }
  };

  if (!task) return null;

  const priorityInfo = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.MEDIUM;
  
  // Calculate progress
  const completedCount = subtasks.filter(s => s.status === 'completed').length;
  const totalCount = subtasks.length;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const handleEdit = () => {
    setEditDialogOpen(true);
  };

  const handleEditSuccess = () => {
    setEditDialogOpen(false);
    onTaskUpdated();
  };

  const toggleSection = (section: keyof typeof sectionsOpen) => {
    setSectionsOpen(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <DialogTitle className="text-2xl font-bold leading-tight">{task.title}</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-muted-foreground">
                  Bekijk en beheer alle details van deze taak
                </DialogDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleEdit} className="shrink-0">
                <Edit className="h-4 w-4 mr-2" />
                Bewerken
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-6">
            {/* Progress Indicator */}
            {subtasks.length > 0 && (
              <div className="p-4 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-5 w-5 text-primary" />
                    <span className="font-semibold text-foreground">Voortgang</span>
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    {completedCount} van {totalCount} afgerond
                  </span>
                </div>
                <Progress value={progressPercentage} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {progressPercentage === 100 
                    ? "🎉 Alle stappen zijn voltooid!" 
                    : `${Math.round(progressPercentage)}% voltooid`}
                </p>
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2">
              <Button 
                onClick={() => setConfirmCompleteOpen(true)}
                className="flex-1 min-w-[200px]"
                size="lg"
                disabled={completing}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Taak Afronden
              </Button>
              <Button 
                variant={isTimerActive ? "destructive" : "outline"}
                className={cn(
                  "flex-1 min-w-[200px] transition-all",
                  isTimerActive && "animate-pulse border-2"
                )}
                size="lg"
                onClick={isTimerActive ? stopTimer : () => startTimer()}
                disabled={timerLoading}
              >
                {isTimerActive ? (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    Stop Timer ({elapsedTime})
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Start Timer
                  </>
                )}
              </Button>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline"
                  size="lg"
                  onClick={() => setReminderDialogOpen(true)}
                >
                  <Bell className="h-4 w-4 mr-2" />
                  Herinnering
                </Button>
                {nextReminder && (
                  <Badge 
                    variant="outline"
                    className="animate-pulse bg-primary/10 text-primary border-primary"
                  >
                    <Bell className="h-3 w-3 mr-1" />
                    {formatDistanceToNow(new Date(nextReminder.at), { locale: nl, addSuffix: true })}
                  </Badge>
                )}
              </div>
            </div>

            {/* Linked Application */}
            {linkedApplication && (
              <div className="p-4 rounded-lg bg-accent/30 border border-accent space-y-2 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Gekoppeld aan sollicitatie</span>
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

            {/* Basic Info Section */}
            <Collapsible 
              open={sectionsOpen.info} 
              onOpenChange={() => toggleSection('info')}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-accent/50 transition-colors group">
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Basis informatie</h3>
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  sectionsOpen.info && "rotate-180"
                )} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4 space-y-3 animate-accordion-down">
                {/* Priority */}
                <div className="flex items-center gap-3 px-3">
                  <span className="text-sm font-medium text-muted-foreground min-w-[100px]">Prioriteit</span>
                  <Badge variant={priorityInfo.variant}>{priorityInfo.label}</Badge>
                </div>

                {/* Assignee */}
                {task.profiles && (
                  <div className="flex items-center gap-3 px-3">
                    <span className="text-sm font-medium text-muted-foreground min-w-[100px]">Toegewezen aan</span>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{task.profiles.name || task.profiles.email}</span>
                    </div>
                  </div>
                )}

                {/* Start Date */}
                {task.start_at && (
                  <div className="flex items-center gap-3 px-3">
                    <span className="text-sm font-medium text-muted-foreground min-w-[100px]">Start</span>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {format(parseISO(task.start_at), "EEEE d MMMM yyyy 'om' HH:mm", { locale: nl })}
                      </span>
                    </div>
                  </div>
                )}

                {/* Due Date */}
                {task.due_at && (
                  <div className="flex items-center gap-3 px-3">
                    <span className="text-sm font-medium text-muted-foreground min-w-[100px]">Deadline</span>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {format(parseISO(task.due_at), "EEEE d MMMM yyyy 'om' HH:mm", { locale: nl })}
                      </span>
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Description Section */}
            {task.description && (
              <Collapsible 
                open={sectionsOpen.description} 
                onOpenChange={() => toggleSection('description')}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-accent/50 transition-colors group">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-foreground">Beschrijving</h3>
                  </div>
                  <ChevronDown className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                    sectionsOpen.description && "rotate-180"
                  )} />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 animate-accordion-down">
                  <div className="bg-muted/50 rounded-lg p-4 mx-3">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{task.description}</p>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Next Action */}
            {task.next_action && (
              <div className="p-4 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border-l-4 border-primary animate-fade-in">
                <div className="flex items-start gap-3">
                  <ArrowRight className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">Volgende actie</h3>
                    <p className="text-sm text-foreground/90">{task.next_action}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Process Steps Section */}
            {subtasks.length > 0 && (
              <Collapsible 
                open={sectionsOpen.steps} 
                onOpenChange={() => toggleSection('steps')}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-accent/50 transition-colors group">
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-foreground">Processtappen</h3>
                    <Badge variant="secondary" className="ml-2">
                      {completedCount}/{totalCount}
                    </Badge>
                  </div>
                  <ChevronDown className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                    sectionsOpen.steps && "rotate-180"
                  )} />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 animate-accordion-down">
                  {loadingSubtasks ? (
                    <div className="text-sm text-muted-foreground px-3">Laden...</div>
                  ) : (
                    <div className="px-3">
                      <ProcessTimeline 
                        subtasks={subtasks}
                        onCompleteStep={handleCompleteStep}
                        onSkipStep={handleSkipStep}
                        onResetStep={handleResetStep}
                      />
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCompleteOpen} onOpenChange={setConfirmCompleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Taak afronden?</AlertDialogTitle>
            <AlertDialogDescription>
              {subtasks.filter(s => s.status !== 'completed' && s.status !== 'skipped').length > 0 ? (
                <>
                  ⚠️ Let op: er {subtasks.filter(s => s.status !== 'completed' && s.status !== 'skipped').length === 1 ? 'is' : 'zijn'} nog{' '}
                  <strong>{subtasks.filter(s => s.status !== 'completed' && s.status !== 'skipped').length}</strong>{' '}
                  {subtasks.filter(s => s.status !== 'completed' && s.status !== 'skipped').length === 1 ? 'subtaak' : 'subtaken'}{' '}
                  niet afgerond.
                </>
              ) : (
                "Weet je zeker dat je deze taak wilt afronden?"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completing}>Annuleren</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmComplete}
              disabled={completing}
            >
              {subtasks.filter(s => s.status !== 'completed' && s.status !== 'skipped').length > 0 
                ? "Toch afronden" 
                : "Afronden"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TaskDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleEditSuccess}
        taskId={task.id}
      />
      
      <ReminderDialog
        open={reminderDialogOpen}
        onOpenChange={setReminderDialogOpen}
        taskId={task?.id}
        onSuccess={() => {
          loadNextReminder();
          toast({ title: "Herinnering toegevoegd" });
        }}
      />
    </>
  );
}