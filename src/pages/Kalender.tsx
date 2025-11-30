import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format, startOfWeek, endOfDay, startOfDay, addDays, isSameDay, parseISO, getWeek, endOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { ChevronLeft, ChevronRight, User, Trash2, Plus, Calendar, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { TaskDialog } from "@/components/TaskDialog";
import { useToast } from "@/hooks/use-toast";
import { useCountUp } from "@/hooks/useCountUp";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { KPICard } from "@/components/ui/kpi-card";

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

interface Reminder {
  id: string;
  title: string | null;
  at: string;
  task_id: string | null;
  subtask_id: string | null;
  tasks?: { title: string } | null;
  subtasks?: { title: string } | null;
}

const priorityConfig = {
  low: { label: "Laag", variant: "outline" as const },
  medium: { label: "Normaal", variant: "secondary" as const },
  high: { label: "Hoog", variant: "default" as const },
  critical: { label: "Kritiek", variant: "destructive" as const },
};

export default function Kalender() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { locale: nl, weekStartsOn: 1 }));
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"5" | "7">("5");
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);
  const [newTaskDate, setNewTaskDate] = useState<Date | null>(null);

  useEffect(() => {
    checkAuth();
    fetchTasks();
    fetchReminders();
  }, []);

  useEffect(() => {
    const tasksChannel = supabase
      .channel('kalender-tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchTasks())
      .subscribe();

    const remindersChannel = supabase
      .channel('kalender-reminders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, () => fetchReminders())
      .subscribe();

    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(remindersChannel);
    };
  }, []);

  // Calculate values for animated counters (before early return)
  const allWeekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const weekDays = viewMode === "5" ? allWeekDays.slice(0, 5) : allWeekDays;
  
  const getTasksForDay = (day: Date) => tasks.filter((task) => 
    (task.start_at && isSameDay(parseISO(task.start_at), day)) || (task.due_at && isSameDay(parseISO(task.due_at), day))
  );
  
  const todayTasks = !loading ? getTasksForDay(new Date()).length : 0;
  const urgentCount = !loading ? tasks.filter(t => t.priority === 'high' || t.priority === 'critical').length : 0;

  // Animated counters - always called in same order
  const animatedTodayTasks = useCountUp({ end: todayTasks, duration: 600 });
  const animatedWeekTasks = useCountUp({ end: tasks.length, duration: 600 });
  const animatedReminders = useCountUp({ end: reminders.length, duration: 600 });
  const animatedUrgentTasks = useCountUp({ end: urgentCount, duration: 600 });

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) navigate("/auth");
  };

  const fetchTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userOrgs } = await supabase
        .from("user_organizations")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!userOrgs) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("tasks")
        .select(`
          id, title, description, priority, start_at, due_at, next_action, assignee_id, application_id, recruitment_action_type,
          profiles!tasks_assignee_id_fkey (name, email)
        `)
        .eq("org_id", userOrgs.org_id)
        .is("deleted_at", null)
        .is("completed_at", null)
        .or("start_at.not.is.null,due_at.not.is.null")
        .order("start_at", { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      toast({ title: "Fout bij laden", description: "Kon taken niet laden.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchReminders = async () => {
    try {
      const startOfWeekDate = startOfDay(currentWeekStart);
      const endOfWeekDate = endOfDay(addDays(currentWeekStart, 6));

      const { data, error } = await supabase
        .from("reminders")
        .select(`*, tasks:task_id(title), subtasks:subtask_id(title)`)
        .not("shown_at", "is", null)
        .gte("at", startOfWeekDate.toISOString())
        .lte("at", endOfWeekDate.toISOString())
        .order("at", { ascending: true })
        .limit(100);

      if (error) throw error;
      setReminders(data || []);
    } catch (error) {
      console.error("Error fetching reminders:", error);
    }
  };

  const getRemindersForDay = (day: Date) => reminders.filter((reminder) => isSameDay(parseISO(reminder.at), day));

  const goToPreviousWeek = () => setCurrentWeekStart(addDays(currentWeekStart, -7));
  const goToNextWeek = () => setCurrentWeekStart(addDays(currentWeekStart, 7));
  const goToToday = () => setCurrentWeekStart(startOfWeek(new Date(), { locale: nl, weekStartsOn: 1 }));
  
  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDetailModalOpen(true);
  };

  const handleTaskUpdated = () => {
    fetchTasks();
    setDetailModalOpen(false);
  };

  const handleDayClick = (day: Date) => {
    setNewTaskDate(day);
    setNewTaskDialogOpen(true);
  };

  const handleNewTaskCreated = () => {
    fetchTasks();
    setNewTaskDialogOpen(false);
    setNewTaskDate(null);
  };

  const handleDeleteReminder = async (reminderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from('reminders').delete().eq('id', reminderId);
      if (error) throw error;
      toast({ title: "Herinnering verwijderd", description: "De herinnering is succesvol verwijderd." });
      fetchReminders();
    } catch (error) {
      console.error('Error deleting reminder:', error);
      toast({ title: "Fout", description: "Er is een fout opgetreden.", variant: "destructive" });
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // n = Open nieuwe taak dialog
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setNewTaskDialogOpen(true);
      }

      // Esc = Sluit modals/dialogs
      if (e.key === 'Escape') {
        e.preventDefault();
        if (detailModalOpen) {
          setDetailModalOpen(false);
        } else if (newTaskDialogOpen) {
          setNewTaskDialogOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailModalOpen, newTaskDialogOpen]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Taken laden...</p>
      </div>
    );
  }

  const weekNumber = getWeek(currentWeekStart, { locale: nl });

  return (
    <div className="space-y-6">
      {/* Minimal Hero Section */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Kalender</h1>
          <p className="text-muted-foreground">Week {weekNumber} · {tasks.length} taken gepland</p>
        </div>
        
        <ToggleGroup type="single" value={viewMode} onValueChange={(value) => value && setViewMode(value as "5" | "7")}>
          <ToggleGroupItem value="5" aria-label="Werkweek">Ma-Vr</ToggleGroupItem>
          <ToggleGroupItem value="7" aria-label="Volle week">Ma-Zo</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* KPI Cards met Icons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          icon={Calendar}
          title="Vandaag"
          value={animatedTodayTasks}
          variant="count"
          onClick={goToToday}
        />
        <KPICard
          icon={CheckCircle2}
          title="Deze Week"
          value={animatedWeekTasks}
          variant="success"
          onClick={goToToday}
        />
        <KPICard
          icon={Clock}
          title="Herinneringen"
          value={animatedReminders}
          variant="time"
          onClick={() => {
            const reminderSection = document.querySelector('[data-reminders]');
            reminderSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        />
        <KPICard
          icon={AlertCircle}
          title="Urgent"
          value={animatedUrgentTasks}
          variant="urgent"
          onClick={() => {
            const urgentTasks = document.querySelector('[data-urgent-task]');
            urgentTasks?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        />
      </div>

      {/* Compact Week Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={goToPreviousWeek}>
          <ChevronLeft className="h-4 w-4 mr-1" />Vorige
        </Button>
        <div className="text-center">
          <p className="text-sm font-medium">
            {format(currentWeekStart, 'd MMM', { locale: nl })} - {format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), 'd MMM yyyy', { locale: nl })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={goToToday}>Vandaag</Button>
          <Button variant="ghost" size="sm" onClick={goToNextWeek}>
            Volgende<ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Responsive Calendar Grid */}
      <div className={cn(
        "grid gap-4",
        viewMode === "5" 
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5" 
          : "grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7"
      )}>
        {weekDays.map((day) => {
          const dayTasks = getTasksForDay(day);
          const dayReminders = getRemindersForDay(day);
          const isToday = isSameDay(day, new Date());

          return (
            <Card key={day.toISOString()} className={cn("overflow-hidden transition-all hover:shadow-md min-h-[500px]", isToday && "ring-2 ring-primary")}>
              <CardHeader className={cn("pb-3", isToday && "bg-accent/50")}>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {format(day, 'EEEE', { locale: nl })}
                    {isToday && <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Vandaag</span>}
                  </span>
                  <span className="text-sm font-normal text-muted-foreground">{format(day, 'd MMM', { locale: nl })}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dayTasks.length === 0 && dayReminders.length === 0 ? (
                  <button 
                    onClick={() => handleDayClick(day)}
                    className="w-full text-sm text-muted-foreground text-center py-8 hover:bg-accent/50 rounded-lg transition-colors group"
                  >
                    <Plus className="h-5 w-5 mx-auto mb-2 opacity-50 group-hover:opacity-100" />
                    <p>Klik om taak toe te voegen</p>
                  </button>
                ) : (
                  <>
                    {dayTasks.map((task, taskIndex) => (
                      <div 
                        key={task.id} 
                        onClick={() => handleTaskClick(task)} 
                        className="p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors space-y-1.5"
                        {...(taskIndex === 0 && (task.priority === 'high' || task.priority === 'critical') && { 'data-urgent-task': true })}
                      >
                        <p className="font-medium text-sm line-clamp-2">{task.title}</p>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{priorityConfig[task.priority as keyof typeof priorityConfig]?.label || priorityConfig.medium.label}</span>
                          {task.start_at && <span>{format(parseISO(task.start_at), 'HH:mm')}</span>}
                          {!task.start_at && task.due_at && <span>{format(parseISO(task.due_at), 'HH:mm')}</span>}
                        </div>
                        {task.profiles && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span className="truncate">{task.profiles.name || task.profiles.email}</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {dayReminders.map((reminder, reminderIndex) => (
                      <div 
                        key={reminder.id} 
                        className="p-3 rounded-lg border bg-muted/30 space-y-1"
                        {...(reminderIndex === 0 && { 'data-reminders': true })}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm line-clamp-2 flex-1">{reminder.title || "Herinnering"}</p>
                          <Button variant="ghost" size="sm" onClick={(e) => handleDeleteReminder(reminder.id, e)} className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">{format(parseISO(reminder.at), 'HH:mm')}</p>
                      </div>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <TaskDetailModal task={selectedTask} open={detailModalOpen} onOpenChange={setDetailModalOpen} onTaskUpdated={handleTaskUpdated} />
      <TaskDialog 
        open={newTaskDialogOpen} 
        onOpenChange={setNewTaskDialogOpen} 
        onSuccess={handleNewTaskCreated}
        defaultStartDate={newTaskDate || undefined}
        defaultDueDate={newTaskDate || undefined}
      />
    </div>
  );
}
