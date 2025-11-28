import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, CheckCircle2, Clock, Trash2, ArrowUpDown, Check, ChevronDown, ChevronRight, Circle, SkipForward, ListTodo, User, Zap, Sparkles, CheckSquare } from "lucide-react";
import { TaskItem } from "@/components/TaskItem";
import { UpcomingRemindersWidget } from "@/components/UpcomingRemindersWidget";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { TaskDialog } from "@/components/TaskDialog";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { ActiveProcessWidget } from "@/components/ActiveProcessWidget";
import { QuickTimerButton } from "@/components/QuickTimerButton";
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

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  useEffect(() => {
    loadTasks();
    loadTodayHours();
    loadCompletedThisWeek();
    loadActiveTimers();

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
          console.log('Task change detected:', payload);
          loadTasks();
          loadCompletedThisWeek();
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
      console.error("Error loading tasks:", error);
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
        console.error("Auth error:", userError);
        toast.error("Authenticatie fout");
        return;
      }

      console.log("Deleting task:", taskToDelete, "by user:", user.id);
      
      const { error } = await supabase
        .from("tasks")
        .update({ 
          deleted_at: new Date().toISOString(),
          deleted_by: user.id 
        })
        .eq("id", taskToDelete);

      if (error) {
        console.error("Delete error details:", error);
        throw error;
      }

      toast.success("Taak verwijderd");
      loadTasks();
    } catch (error: any) {
      console.error("Error deleting task:", error);
      toast.error(`Fout bij verwijderen: ${error.message || 'Onbekende fout'}`);
    } finally {
      setDeleteDialogOpen(false);
      setTaskToDelete(null);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      // Zoek de "Afgerond" kolom
      const { data: doneColumn } = await supabase
        .from("columns")
        .select("id")
        .eq("status", "DONE")
        .limit(1)
        .single();

      const updates: any = { completed_at: new Date().toISOString() };
      
      // Synchroniseer column_id met "Afgerond" kolom
      if (doneColumn) {
        updates.column_id = doneColumn.id;
      }

      const { error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", taskId);

      if (error) throw error;

      toast.success("Taak afgerond");
      loadTasks();
    } catch (error) {
      console.error("Error completing task:", error);
      toast.error("Fout bij afronden van taak");
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
      console.error('Error completing subtask:', error);
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
      console.error('Error skipping subtask:', error);
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

  const priorityColors: Record<string, string> = {
    LOW: "text-priority-low",
    MEDIUM: "text-priority-medium",
    HIGH: "text-priority-high",
    CRITICAL: "text-priority-critical",
  };

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

  // Helper function voor context-aware greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Goedemorgen";
    if (hour < 18) return "Goedemiddag";
    return "Goedenavond";
  };

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

      console.log('Activation results:', result);
    } catch (error) {
      console.error('Function activation error:', error);
      toast.error('Kon edge functions niet activeren', {
        description: error instanceof Error ? error.message : 'Onbekende fout'
      });
    } finally {
      setActivatingFunctions(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Section - Apple Style with Entrance Animation */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-5xl font-bold mb-1">
              {getGreeting()}, {user?.user_metadata?.name || 'daar'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {format(new Date(), "EEEE d MMMM", { locale: nl })}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              onClick={() => setDialogOpen(true)}
              size="lg"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nieuwe taak
            </Button>
            {activatingFunctions ? (
              <Button 
                variant="outline" 
                size="icon"
                disabled
                className="h-10 w-10"
              >
                <Clock className="h-4 w-4 animate-spin" />
              </Button>
            ) : (
              <Button 
                variant="outline" 
                size="icon"
                onClick={activateAllFunctions}
                title="Activeer systeem functies"
                className="h-10 w-10"
              >
                <Zap className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground">
          {tasks.length > 0 ? (
            <>
              Je hebt <strong className="text-foreground">{tasks.length} actieve taken</strong>
              {priorityBreakdown.critical > 0 && (
                <span className="text-priority-critical"> • {priorityBreakdown.critical} kritiek</span>
              )}
              {priorityBreakdown.high > 0 && (
                <span className="text-priority-high"> • {priorityBreakdown.high} hoog</span>
              )}
            </>
          ) : (
            <span>Geen openstaande taken</span>
          )}
        </p>
      </motion.div>

      {/* Stats Bar - Gradient Cards met Micro-animaties */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-4 gap-4"
      >
        {/* Open Tasks - Blue Gradient */}
        <div className="group flex flex-col items-center justify-center p-6 rounded-xl 
                       bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900
                       hover:shadow-lg hover:scale-105 transition-all duration-300 cursor-default
                       border border-blue-100 dark:border-blue-800">
          <span className="text-4xl font-bold text-blue-600 dark:text-blue-400 
                           group-hover:scale-110 transition-transform duration-200">
            {tasks.length}
          </span>
          <span className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1 font-medium">
            Open
          </span>
        </div>

        {/* Completed - Green Gradient */}
        <div className="group flex flex-col items-center justify-center p-6 rounded-xl 
                       bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900
                       hover:shadow-lg hover:scale-105 transition-all duration-300 cursor-default
                       border border-green-100 dark:border-green-800">
          <span className="text-4xl font-bold text-green-600 dark:text-green-400 
                           group-hover:scale-110 transition-transform duration-200">
            {completedThisWeek}
          </span>
          <span className="text-xs text-green-600/70 dark:text-green-400/70 mt-1 font-medium">
            Afgerond
          </span>
        </div>

        {/* Hours Worked - Amber Gradient */}
        <div className="group flex flex-col items-center justify-center p-6 rounded-xl 
                       bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900
                       hover:shadow-lg hover:scale-105 transition-all duration-300 cursor-default
                       border border-amber-100 dark:border-amber-800">
          <span className="text-4xl font-bold text-amber-600 dark:text-amber-400 
                           group-hover:scale-110 transition-transform duration-200">
            {todayHours.split(' ')[0]}
          </span>
          <span className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1 font-medium">
            Gewerkt
          </span>
        </div>

        {/* Priority - Orange Gradient */}
        <div className="group flex flex-col items-center justify-center p-6 rounded-xl 
                       bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900
                       hover:shadow-lg hover:scale-105 transition-all duration-300 cursor-default
                       border border-orange-100 dark:border-orange-800">
          <span className="text-4xl font-bold text-orange-600 dark:text-orange-400 
                           group-hover:scale-110 transition-transform duration-200">
            {priorityBreakdown.critical + priorityBreakdown.high}
          </span>
          <span className="text-xs text-orange-600/70 dark:text-orange-400/70 mt-1 font-medium">
            Prioriteit
          </span>
        </div>
      </motion.div>

      {/* Active Process Steps Widget - Subtiel gepositioneerd */}
      <ActiveProcessWidget />

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
              <SelectTrigger className="w-[180px]">
                <ArrowUpDown className="h-4 w-4 mr-2" />
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
                    className="border rounded-lg bg-card hover:shadow-md hover:border-primary/30 transition-all duration-200 group"
                  >
                    <div
                      onClick={() => handleTaskClick(task)}
                      className={`flex items-center justify-between p-3 hover:bg-accent/30 transition-colors cursor-pointer ${
                        activeTimer ? "ring-2 ring-primary/50 bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{task.title}</p>
                          {hasSubtasks && (
                            <Badge variant="outline" className="flex items-center gap-1">
                              <ListTodo className="h-3 w-3" />
                              {task.completed_subtask_count}/{task.subtask_count}
                            </Badge>
                          )}
                          {task.profiles ? (
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {task.profiles.name || task.profiles.email}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="flex items-center gap-1 text-muted-foreground">
                              <User className="h-3 w-3" />
                              Niet toegewezen
                            </Badge>
                          )}
                          {activeTimer && (
                            <Badge variant="secondary" className="text-xs bg-primary/20">
                              <Clock className="h-3 w-3 mr-1" />
                              {getRunningTime(activeTimer.start)}
                            </Badge>
                          )}
                        </div>
                        {task.next_action && (
                          <p className="text-sm text-muted-foreground mt-1">{task.next_action}</p>
                        )}
                        {hasSubtasks && (
                          <Progress 
                            value={progressPercentage} 
                            className="h-2 mt-2" 
                            style={{
                              '--progress-color': progressPercentage === 100 ? 'hsl(var(--green-500))' : 'hsl(var(--primary))'
                            } as React.CSSProperties}
                          />
                        )}
                        {activeTimer && (
                          <p className="text-xs text-primary mt-1">
                            {activeTimer.profiles?.name || "Iemand"} werkt hieraan
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className={priorityColors[task.priority]}>
                          {priorityLabels[task.priority]}
                        </Badge>
                        {task.due_at && (
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(task.due_at), "d MMM", { locale: nl })}
                          </span>
                        )}
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
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {isExpanded && hasSubtasks && (
                      <div className="px-3 pb-3 border-t">
                        <div className="pt-3 space-y-2">
                          <h4 className="text-sm font-medium mb-2">Processtappen</h4>
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
