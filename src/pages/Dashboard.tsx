import { useEffect, useState, useRef } from "react";
// useNavigate removed - unused in this component
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Clock, Trash2, ArrowUpDown, Check, ChevronDown, ChevronRight, Circle, SkipForward, Zap, CheckCircle2, ListTodo, AlertCircle, ArrowRight } from "lucide-react";
import { UpcomingRemindersWidget } from "@/components/UpcomingRemindersWidget";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import confetti from "canvas-confetti";
import { TaskDialog } from "@/components/TaskDialog";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { QuickTimerButton } from "@/components/QuickTimerButton";
import { RecruitmentKPIs } from "@/components/dashboard/RecruitmentKPIs";
import { TodayFocusCard } from "@/components/dashboard/TodayFocusCard";
import { UrgencyActionPanel } from "@/components/recruitment/UrgencyActionPanel";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useGreeting } from "@/hooks/useGreeting";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { SUBTASK_TOKENS, ACTION_TOKENS } from "@/lib/constants/designTokens";

const log = logger.create('Dashboard');

// Deployment trigger - 2025-10-03 23:21

interface Subtask {
  id: string;
  title: string;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  order: number;
  due_at: string | null;
  assignee_id: string | null;
  profiles: {
    name: string | null;
  } | null;
}

interface Task {
  id: string;
  title: string;
  priority: string;
  due_at: string | null;
  next_action: string | null;
  description: string | null;
  start_at: string | null;
  assignee_id: string | null;
  application_id: string | null;
  recruitment_action_type: string | null;
  profiles: {
    name: string | null;
    email: string | null;
  } | null;
  subtasks?: Subtask[];
  subtask_count?: number;
  completed_subtask_count?: number;
}

const Dashboard = () => {
  // navigate removed - unused
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"high-to-low" | "low-to-high">("high-to-low");
  const [todayHours, setTodayHours] = useState<string>("0 uur");
  const [completedThisWeek, setCompletedThisWeek] = useState<number>(0);
  const [activeTimers, setActiveTimers] = useState<Record<string, { user_id: string; start: string; profiles: { name: string | null } | null }>>({});
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const lastUserActionRef = useRef<number>(0);
  const [activatingFunctions, setActivatingFunctions] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [urgencyApplications, setUrgencyApplications] = useState<{ id: string; pipeline_stage: string; created_at: string; updated_at: string | null }[]>([]);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  const loadUrgencyApplications = async () => {
    try {
      const { data, error } = await supabase
        .from("professional_applications")
        .select("id, pipeline_stage, created_at, updated_at")
        .is("deleted_at", null)
        .in("pipeline_stage", ["nieuw", "screening", "interview", "goedgekeurd"]);

      if (error) throw error;
      setUrgencyApplications(data || []);
    } catch (error) {
      log.error("Error loading urgency applications:", error);
    }
  };

  useEffect(() => {
    loadTasks();
    loadTodayHours();
    loadCompletedThisWeek();
    loadActiveTimers();
    loadUrgencyApplications();

    // Real-time listener voor taak updates
    const tasksChannel = supabase
      .channel('dashboard-tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
        },
        (payload) => {
          log.log('Task change detected:', payload);
          loadTasks();
          loadCompletedThisWeek();
        }
      )
      .subscribe();
    
    // Real-time listener voor applicaties (urgency panel)
    const applicationsChannel = supabase
      .channel('dashboard-applications-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'professional_applications'
        },
        () => {
          loadUrgencyApplications();
        }
      )
      .subscribe();

    // Real-time listener voor subtasks
    const subtasksChannel = supabase
      .channel('dashboard-subtasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subtasks'
        },
        () => {
          // Only refresh if it's been more than 1 second since last user action
          // This prevents real-time updates from overriding optimistic updates
          const timeSinceLastAction = Date.now() - lastUserActionRef.current;
          if (timeSinceLastAction > 1000) {
            loadTasks();
          }
        }
      )
      .subscribe();

    // Real-time listener voor time_entries
    const timeEntriesChannel = supabase
      .channel('dashboard-time-entries')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'time_entries'
        },
        () => {
          loadTodayHours();
          loadActiveTimers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(subtasksChannel);
      supabase.removeChannel(timeEntriesChannel);
      supabase.removeChannel(applicationsChannel);
    };
  }, []);

  // Live timer update elke seconde
  useEffect(() => {
    if (Object.keys(activeTimers).length > 0) {
      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [activeTimers]);

  const loadTasks = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          *,
          profiles:profiles!tasks_assignee_id_fkey(name, email),
          subtasks(
            id,
            title,
            status,
            order,
            due_at,
            assignee_id,
            profiles:profiles!subtasks_assignee_id_fkey(name)
          )
        `)
        .is("completed_at", null)
        .is("deleted_at", null)
        .order("due_at", { ascending: true })
        .limit(10);

      if (error) throw error;
      
      // Calculate subtask counts (completed + skipped count as done)
      const tasksWithCounts = (data || []).map(task => ({
        ...task,
        subtasks: task.subtasks?.sort((a: Subtask, b: Subtask) => a.order - b.order) || [],
        subtask_count: task.subtasks?.length || 0,
        completed_subtask_count: task.subtasks?.filter((s: Subtask) => s.status === 'completed' || s.status === 'skipped').length || 0
      }));
      
      setTasks(tasksWithCounts);
    } catch (error) {
      log.error("Error loading tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTodayHours = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data } = await supabase
      .from("time_entries")
      .select("duration_min")
      .gte("start", today.toISOString());
    
    if (data) {
      const totalMinutes = data.reduce((sum, entry) => sum + (entry.duration_min || 0), 0);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      setTodayHours(minutes > 0 ? `${hours} uur ${minutes}m` : `${hours} uur`);
    }
  };

  const loadCompletedThisWeek = async () => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
    weekStart.setHours(0, 0, 0, 0);
    
    const { data, error } = await supabase
      .from("tasks")
      .select("id")
      .not("completed_at", "is", null)
      .is("deleted_at", null)
      .gte("completed_at", weekStart.toISOString());
    
    if (!error && data) {
      setCompletedThisWeek(data.length || 0);
    }
  };

  const loadActiveTimers = async () => {
    const { data } = await supabase
      .from("time_entries")
      .select("task_id, user_id, start, profiles:profiles!time_entries_user_id_fkey(name)")
      .is("end", null);
    
    if (data) {
      const timersMap: Record<string, any> = {};
      data.forEach((entry: any) => {
        timersMap[entry.task_id] = entry;
      });
      setActiveTimers(timersMap);
    }
  };

  const getRunningTime = (start: string) => {
    const now = currentTime;
    const startTime = new Date(start);
    const totalSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}u ${minutes}m ${seconds}s`;
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        log.error("Auth error:", userError);
        toast.error("Authenticatie fout");
        return;
      }

      log.log("Deleting task:", taskToDelete, "by user:", user.id);
      
      const { error } = await supabase
        .from("tasks")
        .update({ 
          deleted_at: new Date().toISOString(),
          deleted_by: user.id 
        })
        .eq("id", taskToDelete);

      if (error) {
        log.error("Delete error details:", error);
        throw error;
      }

      toast.success("Taak verwijderd");
      loadTasks();
    } catch (error: any) {
      log.error("Error deleting task:", error);
      toast.error(`Fout bij verwijderen: ${error.message || 'Onbekende fout'}`);
    } finally {
      setDeleteDialogOpen(false);
      setTaskToDelete(null);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    
    try {
      // Zoek de "Afgerond" kolom
      const { data: doneColumn } = await supabase
        .from("columns")
        .select("id")
        .eq("status", "DONE")
        .limit(1)
        .single();

      const { error } = await supabase
        .from("tasks")
        .update({ 
          completed_at: new Date().toISOString(),
          status: 'DONE',
          column_id: doneColumn?.id 
        })
        .eq("id", taskId);

      if (error) throw error;

      // 🎉 Confetti celebration!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      // Toast met undo optie (sonner syntax)
      toast.success("🎉 Taak afgerond!", {
        description: task?.title,
        action: {
          label: "Ongedaan maken",
          onClick: () => undoComplete(taskId)
        }
      });

      loadTasks();
    } catch (error) {
      log.error("Error completing task:", error);
      toast.error("Fout bij afronden van taak");
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
      
      toast.success("Taak hersteld", { 
        description: "Terug op je lijst" 
      });
      
      loadTasks();
    } catch (error) {
      log.error('Error undoing complete:', error);
      toast.error("Kon taak niet herstellen");
    }
  };

  const openDeleteDialog = (taskId: string) => {
    setTaskToDelete(taskId);
    setDeleteDialogOpen(true);
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDetailModalOpen(true);
  };

  const handleTaskUpdated = () => {
    loadTasks();
    loadCompletedThisWeek();
  };

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handleCompleteSubtask = async (subtaskId: string) => {
    // Track user action timestamp
    lastUserActionRef.current = Date.now();
    
    // Optimistic update - update local state immediately
    setTasks(prevTasks => 
      prevTasks.map(task => {
        if (task.subtasks?.some(s => s.id === subtaskId)) {
          const updatedSubtasks = task.subtasks.map(s => 
            s.id === subtaskId ? { ...s, status: 'completed' as const } : s
          );
          return {
            ...task,
            subtasks: updatedSubtasks,
            completed_subtask_count: updatedSubtasks.filter(s => s.status === 'completed' || s.status === 'skipped').length
          };
        }
        return task;
      })
    );

    try {
      const { error } = await supabase
        .from('subtasks')
        .update({ status: 'completed' })
        .eq('id', subtaskId);

      if (error) throw error;

      toast.success("Subtaak voltooid");
    } catch (error) {
      log.error('Error completing subtask:', error);
      toast.error("Kon subtaak niet voltooien");
      // Rollback on error
      loadTasks();
    }
  };

  const handleSkipSubtask = async (subtaskId: string) => {
    // Track user action timestamp
    lastUserActionRef.current = Date.now();
    
    // Optimistic update
    setTasks(prevTasks => 
      prevTasks.map(task => {
        if (task.subtasks?.some(s => s.id === subtaskId)) {
          const updatedSubtasks = task.subtasks.map(s => 
            s.id === subtaskId ? { ...s, status: 'skipped' as const } : s
          );
          return {
            ...task,
            subtasks: updatedSubtasks,
            completed_subtask_count: updatedSubtasks.filter(s => s.status === 'completed' || s.status === 'skipped').length
          };
        }
        return task;
      })
    );

    try {
      const { error } = await supabase
        .from('subtasks')
        .update({ status: 'skipped' })
        .eq('id', subtaskId);

      if (error) throw error;

      toast.success("Subtaak overgeslagen");
    } catch (error) {
      log.error('Error skipping subtask:', error);
      toast.error("Kon subtaak niet overslaan");
      // Rollback on error
      loadTasks();
    }
  };

  const handleResetSubtask = async (subtaskId: string) => {
    // Track user action timestamp
    lastUserActionRef.current = Date.now();
    
    // Optimistic update
    setTasks(prevTasks => 
      prevTasks.map(task => {
        if (task.subtasks?.some(s => s.id === subtaskId)) {
          const updatedSubtasks = task.subtasks.map(s => 
            s.id === subtaskId ? { ...s, status: 'pending' as const } : s
          );
          return {
            ...task,
            subtasks: updatedSubtasks,
            completed_subtask_count: updatedSubtasks.filter(s => s.status === 'completed' || s.status === 'skipped').length
          };
        }
        return task;
      })
    );

    try {
      const { error } = await supabase
        .from('subtasks')
        .update({ status: 'pending' })
        .eq('id', subtaskId);

      if (error) throw error;

      toast.success("Subtaak teruggezet");
    } catch (error) {
      console.error('Error resetting subtask:', error);
      toast.error("Kon subtaak niet terugzetten");
      // Rollback on error
      loadTasks();
    }
  };

  const priorityValue: Record<string, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    if (sortOrder === "high-to-low") {
      return priorityValue[b.priority] - priorityValue[a.priority];
    } else {
      return priorityValue[a.priority] - priorityValue[b.priority];
    }
  });

  const priorityLabels: Record<string, string> = {
    LOW: "Laag",
    MEDIUM: "Gemiddeld",
    HIGH: "Hoog",
    CRITICAL: "Kritiek",
  };

  // Skeleton loading component
  const TaskSkeleton = () => (
    <div className="border rounded-lg p-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-2/3" />
          <div className="h-3 bg-muted rounded w-1/3" />
        </div>
        <div className="flex gap-2">
          <div className="h-6 w-16 bg-muted rounded-full" />
          <div className="h-8 w-8 bg-muted rounded" />
        </div>
      </div>
    </div>
  );

  // Priority breakdown voor smart summary
  const priorityBreakdown = {
    critical: tasks.filter(t => t.priority === 'CRITICAL').length,
    high: tasks.filter(t => t.priority === 'HIGH').length,
    medium: tasks.filter(t => t.priority === 'MEDIUM').length,
    low: tasks.filter(t => t.priority === 'LOW').length,
  };

  const activateAllFunctions = async () => {
    setActivatingFunctions(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('function-activator', {
        body: { trigger: 'manual_dashboard' }
      });

      if (error) throw error;

      const result = data as {
        success: boolean;
        statistics: {
          successful: number;
          failed: number;
          total_functions: number;
        };
        successful_functions: string[];
        failed_functions: { name: string; error: string }[];
      };

      if (result.success) {
        toast.success(`${result.statistics.successful}/${result.statistics.total_functions} edge functions geactiveerd! 🚀`);
      } else {
        toast.warning(
          `${result.statistics.successful}/${result.statistics.total_functions} gelukt. ${result.statistics.failed} mislukt.`,
          {
            description: result.failed_functions.map(f => f.name).join(', ')
          }
        );
      }

      log.log('Activation results:', result);
    } catch (error) {
      log.error('Function activation error:', error);
      toast.error('Kon edge functions niet activeren', {
        description: error instanceof Error ? error.message : 'Onbekende fout'
      });
    } finally {
      setActivatingFunctions(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // n = Nieuwe taak
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setDialogOpen(true);
      }

      // Esc = Close dialogs
      if (e.key === 'Escape') {
        setDialogOpen(false);
        setDetailModalOpen(false);
        setDeleteDialogOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Get personalized greeting
  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0];
  const { fullGreeting } = useGreeting(displayName);

  return (
    <div className="space-y-6">
      {/* Hero Section - Minimal */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{fullGreeting}</h1>
          <p className="text-muted-foreground">
            {tasks.length > 0 ? (
              <>
                {tasks.length} actieve {tasks.length === 1 ? 'taak' : 'taken'}
                {priorityBreakdown.critical + priorityBreakdown.high > 0 && (
                  <span className="text-muted-foreground/80"> • {priorityBreakdown.critical + priorityBreakdown.high} prioriteit</span>
                )}
              </>
            ) : (
              'Geen openstaande taken'
            )}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button onClick={() => setDialogOpen(true)} size="default">
            <Plus className="h-4 w-4 mr-2" />
            Nieuwe taak
          </Button>
          {activatingFunctions ? (
            <Button variant="outline" size="icon" disabled>
              <Clock className="h-4 w-4 animate-spin" />
            </Button>
          ) : (
            <Button 
              variant="outline" 
              size="icon"
              onClick={activateAllFunctions}
              title="Activeer systeem functies"
            >
              <Zap className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Recruitment KPI's - Core Dashboard Metrics */}
      <RecruitmentKPIs />

      {/* Urgency Action Panel - Recruitment Alerts */}
      {urgencyApplications.length > 0 && (
        <UrgencyActionPanel applications={urgencyApplications} />
      )}

      {/* Vandaag Focus - Full Width */}
      <TodayFocusCard />

      {/* Upcoming Reminders Widget */}
      <UpcomingRemindersWidget />

      {/* Zone 1: Nu Doen - Primary Focus Tasks */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle>
                Nu Doen
              </CardTitle>
              <CardDescription>
                {tasks.length > 0 
                  ? `${tasks.length} ${tasks.length === 1 ? 'taak' : 'taken'} die aandacht ${tasks.length === 1 ? 'vraagt' : 'vragen'}`
                  : 'Geen openstaande taken'
                }
              </CardDescription>
            </div>
            <Select value={sortOrder} onValueChange={(value: any) => setSortOrder(value)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high-to-low">Hoog → Laag</SelectItem>
                <SelectItem value="low-to-high">Laag → Hoog</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <TaskSkeleton key={i} />)}
            </div>
          ) : tasks.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center py-16"
            >
              <div className="rounded-full bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 p-6 mb-4">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Alles afgerond!</h3>
              <p className="text-muted-foreground text-center max-w-sm mb-4">
                Je hebt geen openstaande taken. Geniet van je vrije tijd of maak een nieuwe taak aan.
              </p>
              <Button onClick={() => setDialogOpen(true)} size="lg">
                <Plus className="h-4 w-4 mr-2" />
                Nieuwe taak
              </Button>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {sortedTasks.map((task) => {
                const activeTimer = activeTimers[task.id];
                const isExpanded = expandedTasks.has(task.id);
                const hasSubtasks = (task.subtask_count || 0) > 0;
                const progressPercentage = hasSubtasks 
                  ? ((task.completed_subtask_count || 0) / (task.subtask_count || 1)) * 100 
                  : 0;

                return (
                  <motion.div 
                    key={task.id} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border rounded-lg bg-card hover:shadow-sm hover:bg-accent/20 transition-all duration-150 group focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
                  >
                    <div
                      onClick={() => handleTaskClick(task)}
                      className={`flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors cursor-pointer ${
                        activeTimer ? "ring-2 ring-primary/50 bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-medium text-sm leading-snug truncate">{task.title}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                            {task.profiles?.name || task.profiles?.email || 'Niet toegewezen'}
                          </span>
                          {hasSubtasks && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <ListTodo className="h-3 w-3" />
                              {task.completed_subtask_count}/{task.subtask_count}
                            </span>
                          )}
                          {activeTimer && (
                            <span className="text-xs text-primary flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {getRunningTime(activeTimer.start)}
                            </span>
                          )}
                        </div>
                        {task.next_action && (
                          <div className={cn(ACTION_TOKENS.compact.wrapper, "mt-1 group/action")}>
                            <ArrowRight className={ACTION_TOKENS.compact.icon} />
                            <p className={cn(ACTION_TOKENS.compact.text, "line-clamp-1 group-hover/action:text-primary transition-colors")}>
                              {task.next_action}
                            </p>
                          </div>
                        )}
                        {hasSubtasks && (
                          <Progress 
                            value={progressPercentage} 
                            className={cn(SUBTASK_TOKENS.progress.height, "mt-2")} 
                            style={{
                              '--progress-color': progressPercentage === 100 ? 'hsl(var(--green-500))' : 'hsl(var(--primary))'
                            } as React.CSSProperties}
                          />
                        )}
                        {/* Actieve subtaak indicator - Enterprise UX */}
                        {hasSubtasks && (() => {
                          const activeSubtask = task.subtasks?.find(s => s.status === 'active')
                            || task.subtasks?.find(s => s.status === 'pending');
                          const isComplete = progressPercentage === 100;
                          
                          return activeSubtask && !isComplete ? (
                            <div className={cn(SUBTASK_TOKENS.activeIndicator.wrapper, "mt-1")}>
                              <div className={SUBTASK_TOKENS.activeIndicator.dot} />
                              <span className={cn(SUBTASK_TOKENS.activeIndicator.text, "truncate")}>
                                {activeSubtask.title}
                              </span>
                            </div>
                          ) : null;
                        })()}
                        {activeTimer && (
                          <p className="text-xs text-primary mt-1">
                            {activeTimer.profiles?.name || "Iemand"} werkt hieraan
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                            <div className={`text-xs flex items-center gap-1 ${
                              task.priority === 'CRITICAL' ? 'text-destructive/90 font-semibold' :
                              task.priority === 'HIGH' ? 'text-amber-700 dark:text-amber-400' :
                              task.priority === 'MEDIUM' ? 'text-muted-foreground' :
                              'text-muted-foreground/70'
                            }`}>
                              {(task.priority === 'HIGH' || task.priority === 'CRITICAL') && (
                                <AlertCircle className="h-3 w-3" />
                              )}
                              <span>{priorityLabels[task.priority]}</span>
                            </div>
                        {task.due_at && (() => {
                          const dueDate = new Date(task.due_at);
                          const today = new Date();
                          const isOverdue = dueDate < today && dueDate.toDateString() !== today.toDateString();
                          const isToday = dueDate.toDateString() === today.toDateString();
                          return (
                            <span className={`text-xs w-12 text-right ${
                              isOverdue ? 'text-destructive font-medium' :
                              isToday ? 'text-foreground' :
                              'text-muted-foreground'
                            }`}>
                              {format(dueDate, "d MMM", { locale: nl })}
                            </span>
                          );
                        })()}
                        {hasSubtasks && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTaskExpansion(task.id);
                            }}
                            className="h-8 w-8"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        <QuickTimerButton taskId={task.id} />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCompleteTask(task.id);
                            }}
                            className="h-8 w-8 text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/10 hover:scale-110"
                            title="Markeer als afgerond"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteDialog(task.id);
                          }}
                          className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {isExpanded && hasSubtasks && (
                      <div className="px-4 pb-3 border-t border-border/50 bg-muted/20">
                        <div className="pt-2 space-y-1">
                          <h4 className="text-xs font-medium text-muted-foreground mb-2">Processtappen</h4>
                          {task.subtasks?.map((subtask) => (
                            <div
                              key={subtask.id}
                              className={`flex items-center gap-2 p-2 rounded text-sm ${
                                subtask.status === 'completed'
                                  ? 'bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100'
                                  : subtask.status === 'active'
                                  ? 'bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100'
                                  : subtask.status === 'skipped'
                                  ? 'bg-gray-50 text-gray-500 dark:bg-gray-900'
                                  : 'bg-muted'
                              }`}
                            >
                              <div className="flex-shrink-0">
                                {subtask.status === 'completed' ? (
                                  <CheckCircle2 
                                    className="h-4 w-4 text-green-600 cursor-pointer hover:text-green-700 hover:scale-110 transition-all" 
                                    onClick={() => handleResetSubtask(subtask.id)}
                                  />
                                ) : subtask.status === 'skipped' ? (
                                  <SkipForward 
                                    className="h-4 w-4 text-gray-400 cursor-pointer hover:text-gray-600 hover:scale-110 transition-all" 
                                    onClick={() => handleResetSubtask(subtask.id)}
                                  />
                                ) : (
                                  <Circle 
                                    className="h-4 w-4 cursor-pointer hover:text-primary hover:scale-110 transition-all" 
                                    onClick={() => handleCompleteSubtask(subtask.id)}
                                  />
                                )}
                              </div>
                              <span className="flex-1">{subtask.title}</span>
                              {subtask.status === 'active' && (
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => handleCompleteSubtask(subtask.id)}
                                  >
                                    Voltooid
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => handleSkipSubtask(subtask.id)}
                                  >
                                    Overslaan
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                         </div>
                       </div>
                     )}
                   </motion.div>
                 );
               })}
             </div>
          )}
        </CardContent>
      </Card>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          loadTasks();
        }}
        columnId="770e8400-e29b-41d4-a716-446655440001"
      />

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          onTaskUpdated={handleTaskUpdated}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Taak verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je deze taak wilt verwijderen? Je kunt deze later terugvinden in "Verwijderde taken".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive hover:bg-destructive/90">
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;
