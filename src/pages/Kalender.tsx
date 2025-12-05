import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format, startOfWeek, endOfDay, startOfDay, addDays, isSameDay, parseISO, getWeek, endOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Trash2, Plus, Calendar, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

// Apple-style priority dots
const PRIORITY_DOTS: Record<string, string> = {
  low: "bg-emerald-500",
  medium: "bg-blue-500", 
  high: "bg-amber-500",
  critical: "bg-red-500",
};

// Priority border-left accents
const PRIORITY_BORDERS: Record<string, string> = {
  low: "border-l-emerald-500",
  medium: "border-l-blue-500", 
  high: "border-l-amber-500",
  critical: "border-l-red-500",
};

// Priority background tints (very subtle)
const PRIORITY_BG: Record<string, string> = {
  low: "bg-emerald-50/30 dark:bg-emerald-950/10",
  medium: "bg-blue-50/30 dark:bg-blue-950/10",
  high: "bg-amber-50/30 dark:bg-amber-950/10",
  critical: "bg-red-50/30 dark:bg-red-950/10",
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
  const [activeKpi, setActiveKpi] = useState<string | null>(null);

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
    <div className="space-y-8">
      {/* Minimal Hero Section */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-medium tracking-tight">Kalender</h1>
          <p className="text-sm text-muted-foreground/80">Week {weekNumber} · {tasks.length} taken gepland</p>
        </div>
        
        {/* Pill-style Toggle */}
        <ToggleGroup 
          type="single" 
          value={viewMode} 
          onValueChange={(value) => value && setViewMode(value as "5" | "7")}
          className="bg-muted/50 p-1 rounded-full"
        >
          <ToggleGroupItem 
            value="5" 
            aria-label="Werkweek"
            className="rounded-full px-4 text-sm data-[state=on]:bg-background data-[state=on]:shadow-sm data-[state=on]:text-primary"
          >
            Ma-Vr
          </ToggleGroupItem>
          <ToggleGroupItem 
            value="7" 
            aria-label="Volle week"
            className="rounded-full px-4 text-sm data-[state=on]:bg-background data-[state=on]:shadow-sm data-[state=on]:text-primary"
          >
            Ma-Zo
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* KPI Cards - System style variants */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          isActive={activeKpi === "herinneringen"}
          onClick={() => {
            setActiveKpi(activeKpi === "herinneringen" ? null : "herinneringen");
            const reminderSection = document.querySelector('[data-reminders]');
            reminderSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        />
        <KPICard
          icon={AlertCircle}
          title="Urgent"
          value={animatedUrgentTasks}
          variant="urgent"
          isActive={activeKpi === "urgent"}
          onClick={() => {
            setActiveKpi(activeKpi === "urgent" ? null : "urgent");
            const urgentTasks = document.querySelector('[data-urgent-task]');
            urgentTasks?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        />
      </div>

      {/* Centered Week Navigation */}
      <div className="flex items-center justify-center gap-6">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={goToPreviousWeek}
          className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        
        <div className="text-center min-w-[180px]">
          <p className="text-sm font-medium tabular-nums">
            {format(currentWeekStart, 'd MMM', { locale: nl }).toLowerCase()} – {format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), 'd MMM yyyy', { locale: nl }).toLowerCase()}
          </p>
          <button 
            onClick={goToToday}
            className="text-[11px] text-primary/80 hover:text-primary hover:underline transition-colors"
          >
            Vandaag
          </button>
        </div>
        
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={goToNextWeek}
          className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Responsive Calendar Grid */}
      <div className={cn(
        "grid gap-3",
        viewMode === "5" 
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5" 
          : "grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7"
      )}>
        {weekDays.map((day) => {
          const dayTasks = getTasksForDay(day);
          const dayReminders = getRemindersForDay(day);
          const isToday = isSameDay(day, new Date());
          const dayOfWeek = day.getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

          return (
            <Card 
              key={day.toISOString()} 
              className={cn(
                "overflow-hidden min-h-[480px] border border-border/20 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]",
                isToday && "bg-primary/[0.03] border-primary/10",
                isWeekend && !isToday && "bg-muted/[0.02]"
              )}
            >
              <CardHeader className="pb-3 pt-3.5 px-3.5">
                <CardTitle className="text-sm font-normal tracking-wide flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {isToday && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    )}
                    <span className={cn(isToday ? "text-foreground" : "text-muted-foreground")}>
                      {format(day, 'EEEE', { locale: nl })}
                    </span>
                  </span>
                  <span className="text-[11px] font-normal text-muted-foreground/60 tabular-nums">
                    {format(day, 'd MMM', { locale: nl }).toLowerCase()}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 px-3.5 pb-3.5">
                {dayTasks.length === 0 && dayReminders.length === 0 ? (
                  <button 
                    onClick={() => handleDayClick(day)}
                    className="w-full text-center py-12 rounded-xl transition-all duration-200 group border border-dashed border-muted-foreground/10 hover:border-muted-foreground/25 hover:bg-primary/[0.03]"
                  >
                    <Plus className="h-4 w-4 mx-auto mb-1.5 text-muted-foreground/20 group-hover:text-primary/50 transition-colors" />
                    <p className="text-xs text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors">Taak toevoegen</p>
                  </button>
                ) : (
                  <>
                    {/* Task Cards - Ultra-subtle Apple style with priority border + bg tint */}
                    {dayTasks.map((task, taskIndex) => (
                      <div 
                        key={task.id} 
                        onClick={() => handleTaskClick(task)} 
                        className={cn(
                          "p-3 rounded-xl border-l-2 shadow-[0_0.5px_1px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:translate-y-[-0.5px] cursor-pointer transition-all duration-200 space-y-1.5",
                          PRIORITY_BORDERS[task.priority] || PRIORITY_BORDERS.medium,
                          PRIORITY_BG[task.priority] || PRIORITY_BG.medium
                        )}
                        {...(taskIndex === 0 && (task.priority === 'high' || task.priority === 'critical') && { 'data-urgent-task': true })}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm leading-tight line-clamp-2 flex-1">{task.title}</p>
                          {(task.start_at || task.due_at) && (
                            <span className="text-[11px] text-muted-foreground/60 tabular-nums shrink-0">
                              {task.start_at ? format(parseISO(task.start_at), 'HH:mm') : format(parseISO(task.due_at!), 'HH:mm')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOTS[task.priority] || PRIORITY_DOTS.medium)} />
                          {task.profiles && (
                            <span className="text-[11px] text-muted-foreground/60 truncate max-w-[100px]">
                              {task.profiles.name || task.profiles.email}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {/* Reminder Cards - Amber accent style */}
                    {dayReminders.map((reminder, reminderIndex) => (
                      <div 
                        key={reminder.id} 
                        className="p-3 rounded-xl bg-amber-50/20 dark:bg-amber-950/10 border-l-2 border-l-amber-400/50 group transition-all duration-200 hover:bg-amber-50/30 dark:hover:bg-amber-950/20"
                        {...(reminderIndex === 0 && { 'data-reminders': true })}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 space-y-0.5">
                            <p className="font-medium text-sm line-clamp-2">{reminder.title || "Herinnering"}</p>
                            <p className="text-[11px] text-muted-foreground/60 tabular-nums">{format(parseISO(reminder.at), 'HH:mm')}</p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={(e) => handleDeleteReminder(reminder.id, e)} 
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
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
