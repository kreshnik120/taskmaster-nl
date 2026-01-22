import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
  Edit, 
  ListChecks, 
  Mail, 
  ExternalLink,
  Play,
  Square,
  CheckCircle2,
  Bell,
  ChevronDown,
  Info,
  Video,
  Phone,
  MapPin,
  Users,
  FileUser,
  Paperclip,
  Download,
  Trash2,
  Loader2,
  FileSpreadsheet,
  Image as ImageIcon,
  File,
  Eye,
  GitBranch
} from "lucide-react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { TaskDialog } from "./TaskDialog";
import { ReminderDialog } from "./ReminderDialog";
import { ProcessTimeline } from "./ProcessTimeline";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import { ActionTimeline, ActionHistoryItem, ActiveSubtaskInfo } from "./ActionTimeline";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTaskTimer } from "@/hooks/useTaskTimer";
import { InterviewDetails } from "@/types/recruitment";
import { canPreview, formatFileSize } from "@/lib/fileHelpers";

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

interface Attachment {
  id: string;
  name: string;
  url: string;
  created_at: string;
  file_size?: number;
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
  category?: string | null;
  interview_details?: InterviewDetails | null;
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

// Fase 1: Priority Badge Amber Kleursysteem
const PRIORITY_BADGE_STYLES: Record<string, string> = {
  LOW: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  MEDIUM: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  HIGH: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  CRITICAL: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
};

export function TaskDetailModal({ task, open, onOpenChange, onTaskUpdated }: TaskDetailModalProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loadingSubtasks, setLoadingSubtasks] = useState(false);
  const [linkedApplication, setLinkedApplication] = useState<LinkedApplication | null>(null);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [nextReminder, setNextReminder] = useState<any>(null);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [deletingAttachment, setDeletingAttachment] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [sectionsOpen, setSectionsOpen] = useState({
    info: true,
    description: true,
    actions: true,
    steps: true,
    attachments: true
  });
  const [actionHistory, setActionHistory] = useState<ActionHistoryItem[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isLoading: timerLoading, elapsedTime, startTimer, stopTimer, isTimerActive } = useTaskTimer(task?.id || null);

  // Keyboard shortcuts (e/c/t)
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === 'e') {
        // Edit task
        e.preventDefault();
        setEditDialogOpen(true);
      } else if (e.key === 'c') {
        // Complete task
        e.preventDefault();
        setConfirmCompleteOpen(true);
      } else if (e.key === 't') {
        // Toggle timer
        e.preventDefault();
        if (isTimerActive) {
          stopTimer();
        } else {
          startTimer();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isTimerActive, startTimer, stopTimer]);

  // Load subtasks, attachments, actions and application when task changes
  useEffect(() => {
    if (task?.id && open) {
      loadSubtasks();
      loadNextReminder();
      loadAttachments();
      loadActionHistory();
      
      // Load linked application if exists
      if (task.application_id) {
        loadLinkedApplication();
      } else {
        setLinkedApplication(null);
      }
      
      // Subscribe to realtime updates
      const channel = supabase
        .channel(`task-updates-${task.id}`)
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
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'task_action_history',
            filter: `task_id=eq.${task.id}`
          },
          () => {
            loadActionHistory();
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

  const loadAttachments = async () => {
    if (!task?.id) return;
    
    setLoadingAttachments(true);
    try {
      const { data, error } = await supabase
        .from('attachments')
        .select('*')
        .eq('task_id', task.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAttachments(data || []);
    } catch (error) {
      console.error('Error loading attachments:', error);
    } finally {
      setLoadingAttachments(false);
    }
  };

  const loadActionHistory = async () => {
    if (!task?.id) return;
    
    setLoadingActions(true);
    try {
      const { data, error } = await supabase
        .from('task_action_history')
        .select(`
          id,
          action_text,
          action_type,
          created_at,
          completed_at,
          is_current,
          created_by_profile:created_by(name),
          completed_by_profile:completed_by(name)
        `)
        .eq('task_id', task.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      const mapped: ActionHistoryItem[] = (data || []).map((item: any) => ({
        id: item.id,
        action_text: item.action_text,
        action_type: item.action_type,
        created_at: item.created_at,
        completed_at: item.completed_at,
        is_current: item.is_current,
        created_by_name: item.created_by_profile?.name,
        completed_by_name: item.completed_by_profile?.name
      }));
      
      setActionHistory(mapped);
    } catch (error) {
      console.error('Error loading action history:', error);
    } finally {
      setLoadingActions(false);
    }
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['pdf'].includes(ext || '')) return <FileText className="h-4 w-4 text-red-500" />;
    if (['doc', 'docx'].includes(ext || '')) return <FileText className="h-4 w-4 text-blue-500" />;
    if (['xls', 'xlsx'].includes(ext || '')) return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) return <ImageIcon className="h-4 w-4 text-purple-500" />;
    return <File className="h-4 w-4 text-muted-foreground" />;
  };

  const downloadAttachment = async (attachment: Attachment) => {
    try {
      const { data, error } = await supabase.storage
        .from('task-attachments')
        .download(attachment.url);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Download error:', error);
      toast({
        title: "Fout",
        description: "Kon bestand niet downloaden",
        variant: "destructive"
      });
    }
  };

  const deleteAttachment = async (attachment: Attachment) => {
    setDeletingAttachment(attachment.id);
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('task-attachments')
        .remove([attachment.url]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('attachments')
        .delete()
        .eq('id', attachment.id);

      if (dbError) throw dbError;

      toast({ title: "Bijlage verwijderd" });
      loadAttachments();
    } catch (error: any) {
      console.error('Delete error:', error);
      toast({
        title: "Fout",
        description: "Kon bijlage niet verwijderen",
        variant: "destructive"
      });
    } finally {
      setDeletingAttachment(null);
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

  // Bereken de actieve subtaak voor koppeling met Actieverloop
  // Prioriteit: eerste 'active' subtaak, anders eerste 'pending' als fallback
  // BELANGRIJK: Deze hook MOET vóór de early return staan (Rules of Hooks)
  const activeSubtask: ActiveSubtaskInfo | null = useMemo(() => {
    if (subtasks.length === 0) return null;
    const sorted = [...subtasks].sort((a, b) => a.order - b.order);
    const active = sorted.find(s => s.status === 'active');
    const firstPending = !active ? sorted.find(s => s.status === 'pending') : null;
    const target = active || firstPending;
    
    if (!target) return null;
    
    return {
      id: target.id,
      title: target.title,
      assignee_name: target.profiles?.name || target.profiles?.email || undefined,
      due_at: target.due_at || undefined
    };
  }, [subtasks]);

  // Auto-activate first pending subtask for UX consistency
  // BELANGRIJK: Deze hook MOET vóór de early return staan (Rules of Hooks)
  useEffect(() => {
    const autoActivateFirstPending = async () => {
      if (subtasks.length === 0 || !open) return;
      
      const sorted = [...subtasks].sort((a, b) => a.order - b.order);
      const hasActive = sorted.some(s => s.status === 'active');
      
      if (!hasActive) {
        const firstPending = sorted.find(s => s.status === 'pending');
        const hasCompleted = sorted.some(s => s.status === 'completed');
        
        // Auto-activate if workflow started (has completed) or all are pending (new task)
        if (firstPending && (hasCompleted || sorted.every(s => s.status === 'pending'))) {
          await supabase
            .from('subtasks')
            .update({ status: 'active' })
            .eq('id', firstPending.id);
        }
      }
    };
    
    autoActivateFirstPending();
  }, [subtasks, open]);

  // Early return NA alle hooks - voldoet aan Rules of Hooks
  if (!task) return null;

  const priorityInfo = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.MEDIUM;
  
  // Calculate progress
  const completedCount = subtasks.filter(s => s.status === 'completed').length;
  const totalCount = subtasks.length;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Handler voor voltooien van subtaak via Actieverloop
  const handleSubtaskCompletedViaTimeline = async (subtaskId: string) => {
    try {
      // 1. Complete de huidige subtaak
      await supabase
        .from('subtasks')
        .update({ status: 'completed' })
        .eq('id', subtaskId);
        
      // 2. Activeer de volgende pending subtaak
      const sorted = [...subtasks].sort((a, b) => a.order - b.order);
      const currentIndex = sorted.findIndex(s => s.id === subtaskId);
      const nextPending = sorted.slice(currentIndex + 1).find(s => s.status === 'pending');
      
      if (nextPending) {
        await supabase
          .from('subtasks')
          .update({ status: 'active' })
          .eq('id', nextPending.id);
      }
      
      // 3. Log naar action history voor audit trail
      const { data: { user } } = await supabase.auth.getUser();
      const completedSubtask = subtasks.find(s => s.id === subtaskId);
      
      await supabase
        .from('task_action_history')
        .insert({
          task_id: task.id,
          action_text: `Subtaak voltooid: ${completedSubtask?.title || 'Onbekend'}`,
          action_type: 'status_change',
          completed_at: new Date().toISOString(),
          completed_by: user?.id,
          is_current: false
        });
      
      toast({
        title: "Subtaak voltooid",
        description: completedSubtask?.title || "Processtap is afgerond"
      });
      
      loadSubtasks();
      loadActionHistory();
      onTaskUpdated();
    } catch (error) {
      console.error('Error completing subtask via timeline:', error);
      toast({
        title: "Fout",
        description: "Kon subtaak niet voltooien",
        variant: "destructive"
      });
    }
  };

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
                {/* Fase 10: Dialog Header Eleganter */}
                <DialogTitle className="text-xl font-semibold leading-tight tracking-tight">{task.title}</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-muted-foreground/70">
                  Bekijk en beheer alle details van deze taak
                </DialogDescription>
              </div>
              {/* Fase 3: Keyboard Hints Hover-only */}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleEdit} 
                className="shrink-0 group"
                aria-label="Bewerk taak (sneltoets: e)"
              >
                <Edit className="h-4 w-4 mr-2" />
                Bewerken
                <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-0 group-hover:opacity-40 transition-opacity">
                  E
                </kbd>
              </Button>
            </div>
          </DialogHeader>

          {/* Fase 8: Spacing Harmonisatie */}
          <div className="space-y-5">
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

            {/* Fase 2: Quick Actions Grid Layout */}
            <div className="grid grid-cols-3 gap-3">
              <Button 
                onClick={() => setConfirmCompleteOpen(true)}
                className="group"
                size="lg"
                disabled={completing}
                aria-label="Taak afronden (sneltoets: c)"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Taak Afronden
                <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-0 group-hover:opacity-40 transition-opacity">
                  C
                </kbd>
              </Button>
              <Button 
                variant={isTimerActive ? "destructive" : "outline"}
                className={cn(
                  "transition-all group",
                  isTimerActive && "animate-pulse border-2"
                )}
                size="lg"
                onClick={isTimerActive ? stopTimer : () => startTimer()}
                disabled={timerLoading}
                aria-label={`Timer ${isTimerActive ? 'stoppen' : 'starten'} (sneltoets: t)`}
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
                <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-0 group-hover:opacity-40 transition-opacity">
                  T
                </kbd>
              </Button>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline"
                  size="lg"
                  onClick={() => setReminderDialogOpen(true)}
                  className="flex-1"
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

            {/* Interview-Specifieke Sectie */}
            {task.category === 'interview' && task.interview_details && (
              <div className="p-5 rounded-xl bg-gradient-to-br from-purple-50/60 to-purple-100/30 dark:from-purple-900/20 dark:to-purple-800/10 border border-purple-200/50 dark:border-purple-700/30 space-y-4 animate-fade-in">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {task.interview_details.interview_type === 'video' && <Video className="h-5 w-5 text-purple-600 dark:text-purple-400" />}
                      {task.interview_details.interview_type === 'phone' && <Phone className="h-5 w-5 text-purple-600 dark:text-purple-400" />}
                      {task.interview_details.interview_type === 'in_person' && <MapPin className="h-5 w-5 text-purple-600 dark:text-purple-400" />}
                      {!task.interview_details.interview_type && <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />}
                      <span className="text-lg font-semibold text-purple-900 dark:text-purple-100">
                        Interview met {task.interview_details.candidate_name}
                      </span>
                    </div>
                    {task.start_at && (
                      <p className="text-sm text-purple-700/80 dark:text-purple-300/80">
                        {format(parseISO(task.start_at), "EEEE d MMMM yyyy", { locale: nl })} • {format(parseISO(task.start_at), "HH:mm", { locale: nl })} uur
                        {task.interview_details.duration_minutes && ` (${task.interview_details.duration_minutes} min)`}
                      </p>
                    )}
                  </div>
                  <Badge 
                    variant="outline" 
                    className="bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/50 dark:text-purple-300 dark:border-purple-700"
                  >
                    {task.interview_details.interview_type === 'video' ? 'Microsoft Teams' 
                      : task.interview_details.interview_type === 'phone' ? 'Telefonisch' 
                      : task.interview_details.interview_type === 'in_person' ? 'Op locatie' 
                      : 'Interview'}
                  </Badge>
                </div>

                {/* Join Meeting Button (for video) */}
                {task.interview_details.interview_type === 'video' && task.interview_details.teams_link && (
                  <Button 
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => window.open(task.interview_details?.teams_link, '_blank')}
                  >
                    <Video className="h-4 w-4 mr-2" />
                    Join Microsoft Teams Meeting
                  </Button>
                )}

                {/* Location (for in_person) */}
                {task.interview_details.interview_type === 'in_person' && task.interview_details.location && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-white/50 dark:bg-black/20">
                    <MapPin className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm text-purple-800 dark:text-purple-200">{task.interview_details.location}</span>
                  </div>
                )}

                {/* Participants */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-purple-700 dark:text-purple-300">
                    <Users className="h-4 w-4" />
                    Deelnemers
                  </div>
                  <div className="grid gap-2 pl-6">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-white/50 dark:bg-black/20">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{task.interview_details.candidate_name}</span>
                        <Badge variant="secondary" className="text-[10px]">Kandidaat</Badge>
                      </div>
                      {task.interview_details.candidate_email && (
                        <span className="text-xs text-muted-foreground">{task.interview_details.candidate_email}</span>
                      )}
                    </div>
                    {task.interview_details.interviewer_name && (
                      <div className="flex items-center justify-between p-2 rounded-lg bg-white/50 dark:bg-black/20">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{task.interview_details.interviewer_name}</span>
                          <Badge variant="secondary" className="text-[10px]">Interviewer</Badge>
                        </div>
                        {task.interview_details.interviewer_email && (
                          <span className="text-xs text-muted-foreground">{task.interview_details.interviewer_email}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Organization */}
                {task.interview_details.organization_name && (
                  <div className="flex items-center gap-2 text-sm text-purple-700/80 dark:text-purple-300/80">
                    <span className="text-muted-foreground">Organisatie:</span>
                    <span className="font-medium">{task.interview_details.organization_name}</span>
                  </div>
                )}

                {/* Quick link to application */}
                {task.interview_details.application_id && (
                  <Button
                    variant="outline"
                    className="w-full border-purple-200 dark:border-purple-700 hover:bg-purple-100/50 dark:hover:bg-purple-900/30"
                    onClick={() => navigate(`/sollicitaties?application=${task.interview_details?.application_id}`)}
                  >
                    <FileUser className="h-4 w-4 mr-2" />
                    Bekijk sollicitatie
                    <ExternalLink className="h-3 w-3 ml-auto" />
                  </Button>
                )}
              </div>
            )}

            {/* Fase 4: Linked Application Sectie Strakker - Only show for non-interview tasks */}
            {linkedApplication && task.category !== 'interview' && (
              <div className="p-4 rounded-xl bg-primary/[0.04] border border-primary/10 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary/80" />
                    <span className="text-sm font-medium text-foreground/80">Gekoppeld aan sollicitatie</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      navigate(`/sollicitaties?application=${linkedApplication.id}`);
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-primary" />
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm">
                    {linkedApplication.professionals?.full_name || linkedApplication.email_from}
                  </span>
                  <Badge variant="outline" className="text-xs font-normal">
                    {linkedApplication.pipeline_stage}
                  </Badge>
                </div>
                {task.recruitment_action_type && (
                  <p className="text-xs text-muted-foreground/70">
                    Type: {task.recruitment_action_type}
                  </p>
                )}
              </div>
            )}

            {/* Basic Info Section - Fase 5, 7, 8, 9 */}
            <Collapsible 
              open={sectionsOpen.info} 
              onOpenChange={() => toggleSection('info')}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-muted/20 transition-colors duration-150 group">
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-primary/80" />
                  <h3 className="font-semibold text-foreground">Basis informatie</h3>
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground/60 transition-transform duration-200",
                  sectionsOpen.info && "rotate-180"
                )} />
              </CollapsibleTrigger>
              {/* Fase 5: Grid Alignment + Fase 8: pt-3 */}
              <CollapsibleContent className="pt-3 animate-accordion-down">
                <div className="grid grid-cols-[100px_1fr] gap-y-3 gap-x-4 px-3">
                  {/* Priority - Fase 1: Amber kleursysteem */}
                  <span className="text-sm text-muted-foreground/80">Prioriteit</span>
                  <Badge className={cn("border w-fit", PRIORITY_BADGE_STYLES[task.priority] || PRIORITY_BADGE_STYLES.MEDIUM)}>
                    {priorityInfo.label}
                  </Badge>

                  {/* Assignee */}
                  {task.profiles && (
                    <>
                      <span className="text-sm text-muted-foreground/80">Toegewezen aan</span>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground/60" />
                        <span className="text-sm">{task.profiles.name || task.profiles.email}</span>
                      </div>
                    </>
                  )}

                  {/* Start Date */}
                  {task.start_at && (
                    <>
                      <span className="text-sm text-muted-foreground/80">Start</span>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground/60" />
                        <span className="text-sm">
                          {format(parseISO(task.start_at), "EEEE d MMMM yyyy 'om' HH:mm", { locale: nl })}
                        </span>
                      </div>
                    </>
                  )}

                  {/* Due Date */}
                  {task.due_at && (
                    <>
                      <span className="text-sm text-muted-foreground/80">Deadline</span>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground/60" />
                        <span className="text-sm">
                          {format(parseISO(task.due_at), "EEEE d MMMM yyyy 'om' HH:mm", { locale: nl })}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Description Section - Fase 6, 7, 8, 9 */}
            {task.description && (
              <Collapsible 
                open={sectionsOpen.description} 
                onOpenChange={() => toggleSection('description')}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-muted/20 transition-colors duration-150 group">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary/80" />
                    <h3 className="font-semibold text-foreground">Beschrijving</h3>
                  </div>
                  <ChevronDown className={cn(
                    "h-4 w-4 text-muted-foreground/60 transition-transform duration-200",
                    sectionsOpen.description && "rotate-180"
                  )} />
                </CollapsibleTrigger>
                {/* Fase 6: bg subtieler + Fase 8: pt-3 */}
                <CollapsibleContent className="pt-3 animate-accordion-down">
                  <div className="bg-muted/30 dark:bg-muted/20 rounded-xl p-4 mx-3">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{task.description}</p>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Actieverloop Section - Unified Timeline */}
            <Collapsible 
              open={sectionsOpen.actions} 
              onOpenChange={() => toggleSection('actions')}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-muted/20 transition-colors duration-150 group">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5 text-primary/80" />
                  <h3 className="font-semibold text-foreground">Actieverloop</h3>
                  {(task.next_action || activeSubtask || actionHistory.length > 0) && (
                    <Badge variant="secondary" className="ml-2">
                      {actionHistory.filter(a => a.completed_at).length + ((activeSubtask || task.next_action) ? 1 : 0)}
                    </Badge>
                  )}
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground/60 transition-transform duration-200",
                  sectionsOpen.actions && "rotate-180"
                )} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 animate-accordion-down">
                {(loadingActions || loadingSubtasks) ? (
                  <div className="text-sm text-muted-foreground px-3">Laden...</div>
                ) : (
                  <div className="px-3">
                    <ActionTimeline
                      taskId={task.id}
                      currentAction={activeSubtask ? null : task.next_action}
                      actionHistory={actionHistory}
                      activeSubtask={activeSubtask}
                      onActionAdded={() => {
                        onTaskUpdated();
                        loadActionHistory();
                      }}
                      onActionCompleted={() => {
                        onTaskUpdated();
                        loadActionHistory();
                      }}
                      onSubtaskCompleted={handleSubtaskCompletedViaTimeline}
                    />
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Process Steps Section - Fase 7, 8, 9 */}
            {subtasks.length > 0 && (
              <Collapsible 
                open={sectionsOpen.steps} 
                onOpenChange={() => toggleSection('steps')}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-muted/20 transition-colors duration-150 group">
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-5 w-5 text-primary/80" />
                    <h3 className="font-semibold text-foreground">Processtappen</h3>
                    <Badge variant="secondary" className="ml-2">
                      {completedCount}/{totalCount}
                    </Badge>
                  </div>
                  <ChevronDown className={cn(
                    "h-4 w-4 text-muted-foreground/60 transition-transform duration-200",
                    sectionsOpen.steps && "rotate-180"
                  )} />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 animate-accordion-down">
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

            {/* Attachments Section */}
            {attachments.length > 0 && (
              <Collapsible 
                open={sectionsOpen.attachments} 
                onOpenChange={() => toggleSection('attachments')}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-muted/20 transition-colors duration-150 group">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-5 w-5 text-primary/80" />
                    <h3 className="font-semibold text-foreground">Bijlagen</h3>
                    <Badge variant="secondary" className="ml-2">
                      {attachments.length}
                    </Badge>
                  </div>
                  <ChevronDown className={cn(
                    "h-4 w-4 text-muted-foreground/60 transition-transform duration-200",
                    sectionsOpen.attachments && "rotate-180"
                  )} />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 animate-accordion-down">
                  {loadingAttachments ? (
                    <div className="text-sm text-muted-foreground px-3">Laden...</div>
                  ) : (
                    <div className="px-3 space-y-2">
                      {attachments.map((attachment) => {
                        const previewable = canPreview(attachment.name);
                        return (
                          <div 
                            key={attachment.id} 
                            className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/50 group hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {getFileIcon(attachment.name)}
                              <div className="min-w-0 flex-1">
                                <span className="text-sm truncate block">{attachment.name}</span>
                                {attachment.file_size && (
                                  <span className="text-xs text-muted-foreground">
                                    {formatFileSize(attachment.file_size)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {previewable && (
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className="h-8 w-8"
                                  onClick={() => setPreviewAttachment(attachment)}
                                  title="Bekijken"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-8 w-8"
                                onClick={() => downloadAttachment(attachment)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => deleteAttachment(attachment)}
                                disabled={deletingAttachment === attachment.id}
                              >
                                {deletingAttachment === attachment.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
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

      <AttachmentPreviewModal
        attachment={previewAttachment}
        open={!!previewAttachment}
        onOpenChange={(open) => !open && setPreviewAttachment(null)}
        onDownload={() => previewAttachment && downloadAttachment(previewAttachment)}
      />
    </>
  );
}