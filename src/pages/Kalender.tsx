import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format, startOfWeek, endOfDay, startOfDay, addDays, isSameDay, parseISO, getWeek, endOfWeek, differenceInDays, isAfter } from "date-fns";
import { nl } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Trash2, Plus, Calendar, CheckCircle2, Clock, AlertCircle, UserCheck, Video, Phone, MapPin, Sparkles, Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { TaskDialog } from "@/components/TaskDialog";
import { useToast } from "@/hooks/use-toast";
import { useCountUp } from "@/hooks/useCountUp";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { KPICard } from "@/components/ui/kpi-card";
import { InterviewDetails } from "@/types/recruitment";
import { Progress } from "@/components/ui/progress";

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
  category: string | null;
  interview_details: InterviewDetails | null;
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

// Apple-style priority dots (larger + subtler opacity)
const PRIORITY_DOTS: Record<string, string> = {
  low: "bg-emerald-500/80",
  medium: "bg-blue-500/80", 
  high: "bg-amber-500/80",
  critical: "bg-red-500/80",
};

// Priority border-left accents (subtler /70 opacity)
const PRIORITY_BORDERS: Record<string, string> = {
  low: "border-l-emerald-500/70",
  medium: "border-l-blue-500/70", 
  high: "border-l-amber-500/70",
  critical: "border-l-red-500/70",
};

// Priority background tints (stronger /40 light, /20 dark)
const PRIORITY_BG: Record<string, string> = {
  low: "bg-emerald-50/40 dark:bg-emerald-900/20",
  medium: "bg-blue-50/40 dark:bg-blue-900/20",
  high: "bg-amber-50/40 dark:bg-amber-900/20",
  critical: "bg-red-50/40 dark:bg-red-900/20",
};

// Interview task styling - distinct purple theme
const INTERVIEW_STYLES = {
  border: "border-l-purple-500/70",
  bg: "bg-purple-50/40 dark:bg-purple-900/20",
  dot: "bg-purple-500/80",
};

// Helper function to detect interview tasks
const isInterviewTask = (task: Task): boolean => {
  return task.category === 'interview' || 
         task.recruitment_action_type === 'interview' ||
         task.interview_details !== null;
};

// Helper function to check if a task is overdue
const isOverdue = (task: Task): boolean => {
  const dueDate = task.due_at ? parseISO(task.due_at) : task.start_at ? parseISO(task.start_at) : null;
  if (!dueDate) return false;
  const now = new Date();
  // Set to end of day for comparison
  dueDate.setHours(23, 59, 59, 999);
  return isAfter(now, dueDate);
};

// Get contextual empty state message
const getEmptyStateMessage = (day: Date, isWeekend: boolean): { icon: typeof Sparkles; message: string } => {
  const dayOfWeek = day.getDay();
  
  if (isWeekend) {
    return { icon: Coffee, message: "Weekend vrij" };
  }
  
  const now = new Date();
  if (isSameDay(day, now)) {
    return { icon: Sparkles, message: "Vrije dag vandaag!" };
  }
  
  if (differenceInDays(day, now) < 0) {
    return { icon: Calendar, message: "Geen taken" };
  }
  
  return { icon: Plus, message: "Plan een taak" };
};

// Calculate work week progress (Monday = 0%, Friday EOD = 100%)
const getWeekProgress = (): number => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  
  // Sunday = 0, Monday = 1, ..., Saturday = 6
  if (dayOfWeek === 0 || dayOfWeek === 6) return 100; // Weekend = complete
  
  // Monday = 1 -> 0, Friday = 5 -> 4
  const workDayIndex = dayOfWeek - 1; // 0-4 for Mon-Fri
  const dayProgress = hour / 24; // 0-1 progress through current day
  
  // Total progress = (completed days + current day progress) / 5 days
  return Math.round(((workDayIndex + dayProgress) / 5) * 100);
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
          id, title, description, priority, start_at, due_at, next_action, assignee_id, application_id, recruitment_action_type, category, interview_details,
          profiles!tasks_assignee_id_fkey (name, email)
        `)
        .eq("org_id", userOrgs.org_id)
        .is("deleted_at", null)
        .is("completed_at", null)
        .or("start_at.not.is.null,due_at.not.is.null")
        .order("start_at", { ascending: true });

      if (error) throw error;
      setTasks((data || []) as Task[]);
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

      {/* Centered Week Navigation with Progress Bar */}
      <div className="space-y-2">
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
              className="text-[11px] font-medium text-primary hover:text-primary/80 hover:underline transition-colors"
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
        
        {/* Week Progress Bar - Apple-style thin bar */}
        {isSameDay(currentWeekStart, startOfWeek(new Date(), { locale: nl, weekStartsOn: 1 })) && (
          <div className="flex items-center justify-center gap-3 px-16">
            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Ma</span>
            <Progress 
              value={getWeekProgress()} 
              className="h-1 w-48 bg-muted/30" 
            />
            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Vr</span>
          </div>
        )}
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
                isWeekend && !isToday && "bg-muted/[0.02] dark:bg-muted/[0.04]"
              )}
            >
              <CardHeader className="pb-3 pt-3.5 px-3.5">
                <CardTitle className="text-sm font-normal tracking-wide flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {isToday && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    )}
                    <span className={cn(
                      isToday ? "text-primary font-semibold" : "text-muted-foreground",
                      isWeekend && !isToday && "text-muted-foreground/70"
                    )}>
                      {format(day, 'EEEE', { locale: nl })}
                    </span>
                  </span>
                  <span className="text-[11px] font-normal text-muted-foreground/50 tabular-nums">
                    {format(day, 'd MMM', { locale: nl }).toLowerCase()}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 px-3.5 pb-3.5">
                {dayTasks.length === 0 && dayReminders.length === 0 ? (
                  (() => {
                    const emptyState = getEmptyStateMessage(day, isWeekend);
                    const EmptyIcon = emptyState.icon;
                    return (
                      <button 
                        onClick={() => handleDayClick(day)}
                        className="w-full text-center py-12 rounded-xl transition-all duration-200 group border border-dashed border-muted-foreground/10 hover:border-muted-foreground/25 hover:bg-primary/[0.04]"
                      >
                        <EmptyIcon className="h-4 w-4 mx-auto mb-1.5 text-muted-foreground/25 group-hover:text-primary/50 transition-colors" />
                        <p className="text-xs text-muted-foreground/50 group-hover:text-muted-foreground/70 transition-colors">{emptyState.message}</p>
                      </button>
                    );
                  })()
                ) : (
                  <>
                    {/* Task Cards - Ultra-subtle Apple style with priority border + bg tint */}
                    {dayTasks.map((task, taskIndex) => {
                      const isInterview = isInterviewTask(task);
                      const taskIsOverdue = isOverdue(task);
                      const candidateName = task.interview_details?.candidate_name;
                      const interviewType = task.interview_details?.interview_type;
                      const durationMinutes = task.interview_details?.duration_minutes;
                      const organizationName = task.interview_details?.organization_name;
                      
                      // Interview type icons
                      const InterviewTypeIcon = interviewType === 'video' ? Video 
                        : interviewType === 'phone' ? Phone 
                        : interviewType === 'in_person' ? MapPin 
                        : UserCheck;
                      
                      const interviewTypeLabel = interviewType === 'video' ? 'Teams' 
                        : interviewType === 'phone' ? 'Telefoon' 
                        : interviewType === 'in_person' ? 'Locatie' 
                        : 'Interview';
                      
                      // Calculate end time if duration is available
                      const startTime = task.start_at ? format(parseISO(task.start_at), 'HH:mm') : task.due_at ? format(parseISO(task.due_at), 'HH:mm') : null;
                      let timeDisplay = startTime;
                      if (startTime && durationMinutes && task.start_at) {
                        const startDate = parseISO(task.start_at);
                        const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
                        timeDisplay = `${startTime}-${format(endDate, 'HH:mm')}`;
                      }
                      
                      return (
                        <div 
                          key={task.id} 
                          onClick={() => handleTaskClick(task)} 
                          className={cn(
                            "p-3.5 rounded-lg border-l-2 shadow-[0_0.5px_1px_rgba(0,0,0,0.02)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:translate-y-[-0.5px] cursor-pointer transition-all duration-200 space-y-1.5 relative",
                            isInterview 
                              ? [INTERVIEW_STYLES.border, INTERVIEW_STYLES.bg]
                              : [PRIORITY_BORDERS[task.priority] || PRIORITY_BORDERS.medium, PRIORITY_BG[task.priority] || PRIORITY_BG.medium],
                            // Overdue styling: red ring + subtle red tint
                            taskIsOverdue && "ring-1 ring-red-400/50 bg-red-50/30 dark:bg-red-950/20"
                          )}
                          {...(taskIndex === 0 && (task.priority === 'high' || task.priority === 'critical') && { 'data-urgent-task': true })}
                        >
                          {/* Overdue pulsing indicator */}
                          {taskIsOverdue && (
                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                            </span>
                          )}
                          
                          {/* Header row: Icon + Title + Time */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              {isInterview && (
                                <InterviewTypeIcon className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
                              )}
                              <p className="font-medium text-sm text-foreground/90 leading-tight tracking-tight line-clamp-2">
                                {isInterview ? (candidateName || task.title) : task.title}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {timeDisplay && (
                                <span className="text-[11px] text-muted-foreground/70 tabular-nums font-medium">
                                  {timeDisplay}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {/* Interview-specific: Type badge + Organization */}
                          {isInterview ? (
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                                  {interviewTypeLabel}
                                </span>
                                {organizationName && (
                                  <span className="text-[10px] text-muted-foreground/60 truncate max-w-[80px]">
                                    {organizationName}
                                  </span>
                                )}
                              </div>
                              {durationMinutes && (
                                <span className="text-[10px] text-muted-foreground/50">
                                  {durationMinutes}min
                                </span>
                              )}
                            </div>
                          ) : (
                            /* Non-interview: Priority dot + assignee + overdue badge */
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className={cn(
                                  "h-2 w-2 rounded-full", 
                                  taskIsOverdue ? "bg-red-500" : (PRIORITY_DOTS[task.priority] || PRIORITY_DOTS.medium)
                                )} />
                                {task.profiles && (
                                  <span className="text-[11px] text-muted-foreground/70 truncate max-w-[100px]">
                                    {task.profiles.name || task.profiles.email}
                                  </span>
                                )}
                              </div>
                              {taskIsOverdue && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 uppercase tracking-wide">
                                  Verlopen
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Reminder Cards - Amber accent style */}
                    {dayReminders.map((reminder, reminderIndex) => (
                      <div 
                        key={reminder.id} 
                        className="p-3 rounded-xl bg-amber-50/20 dark:bg-amber-900/15 border-l-2 border-l-amber-400/50 group transition-all duration-200 hover:bg-amber-50/30 dark:hover:bg-amber-900/25"
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
