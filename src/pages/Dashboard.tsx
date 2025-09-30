import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, CheckCircle2, Clock, Trash2, ArrowUpDown, Check, ChevronDown, ChevronRight, Circle, SkipForward, ListTodo } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { TaskDialog } from "@/components/TaskDialog";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { ActiveProcessWidget } from "@/components/ActiveProcessWidget";
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
  const [todayHours, setTodayHours] = useState<string>("0u");
  const [completedThisWeek, setCompletedThisWeek] = useState<number>(0);
  const [activeTimers, setActiveTimers] = useState<Record<string, { user_id: string; start: string; profiles: { name: string | null } | null }>>({});
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

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
          loadTasks();
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
      
      // Calculate subtask counts
      const tasksWithCounts = (data || []).map(task => ({
        ...task,
        subtasks: task.subtasks?.sort((a: Subtask, b: Subtask) => a.order - b.order) || [],
        subtask_count: task.subtasks?.length || 0,
        completed_subtask_count: task.subtasks?.filter((s: Subtask) => s.status === 'completed').length || 0
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
      setTodayHours(minutes > 0 ? `${hours}u ${minutes}m` : `${hours}u`);
    }
  };

  const loadCompletedThisWeek = async () => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
    weekStart.setHours(0, 0, 0, 0);
    
    const { data, error } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .not("completed_at", "is", null)
      .gte("completed_at", weekStart.toISOString());
    
    if (!error && data !== null) {
      setCompletedThisWeek(data.length);
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
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("tasks")
        .update({ 
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id 
        })
        .eq("id", taskToDelete);

      if (error) throw error;

      toast.success("Taak verwijderd");
      loadTasks();
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("Fout bij verwijderen van taak");
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
    try {
      const { error } = await supabase
        .from('subtasks')
        .update({ status: 'completed' })
        .eq('id', subtaskId);

      if (error) throw error;

      toast.success("Subtaak voltooid");
      loadTasks();
    } catch (error) {
      console.error('Error completing subtask:', error);
      toast.error("Kon subtaak niet voltooien");
    }
  };

  const handleSkipSubtask = async (subtaskId: string) => {
    try {
      const { error } = await supabase
        .from('subtasks')
        .update({ status: 'skipped' })
        .eq('id', subtaskId);

      if (error) throw error;

      toast.success("Subtaak overgeslagen");
      loadTasks();
    } catch (error) {
      console.error('Error skipping subtask:', error);
      toast.error("Kon subtaak niet overslaan");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Mijn dag</h1>
          <p className="text-muted-foreground">
            {format(new Date(), "EEEE, d MMMM yyyy", { locale: nl })}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nieuwe taak
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vandaag</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tasks.length}</div>
            <p className="text-xs text-muted-foreground">Openstaande taken</p>
          </CardContent>
        </Card>
        <Card 
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => window.location.href = '/afgerond'}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Afgerond</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedThisWeek}</div>
            <p className="text-xs text-muted-foreground">Deze week</p>
          </CardContent>
        </Card>
        <Card 
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => window.location.href = '/tijdregistratie'}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tijdregistratie</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayHours}</div>
            <p className="text-xs text-muted-foreground">Vandaag gewerkt</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Process Steps Widget */}
      <ActiveProcessWidget />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Focus taken</CardTitle>
              <CardDescription>De belangrijkste taken om vandaag aan te werken</CardDescription>
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
            <p className="text-muted-foreground text-center py-8">Laden...</p>
          ) : tasks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Geen openstaande taken. Klik op "Nieuwe taak" om te beginnen!
            </p>
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
                  <div key={task.id} className="border rounded-lg bg-card">
                    <div
                      onClick={() => handleTaskClick(task)}
                      className={`flex items-center justify-between p-3 hover:bg-accent/50 transition-colors cursor-pointer ${
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
                          <Progress value={progressPercentage} className="h-1.5 mt-2" />
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCompleteTask(task.id);
                          }}
                          className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
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
                              {subtask.status === 'completed' ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              ) : subtask.status === 'skipped' ? (
                                <SkipForward className="h-4 w-4 text-gray-400" />
                              ) : (
                                <Circle className="h-4 w-4" />
                              )}
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
                  </div>
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
        columnId={undefined}
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
