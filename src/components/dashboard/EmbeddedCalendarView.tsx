import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format, startOfWeek, endOfDay, startOfDay, addDays, isSameDay, parseISO, getWeek, endOfWeek, differenceInDays, isAfter } from "date-fns";
import { nl } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Trash2, Plus, Calendar, CheckCircle2, Clock, AlertCircle, User, Users, Sparkles, Coffee } from "lucide-react";
import { useMySubtasks } from "@/hooks/useMySubtasks";
import { useGlobalTaskFilter } from "@/hooks/useGlobalTaskFilter";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDroppable, useDraggable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
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
import { ToastAction } from "@/components/ui/toast";

// Type from useMySubtasks hook
type SubtaskFromHook = ReturnType<typeof useMySubtasks>['subtasks'][number];

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
  
  if (dayOfWeek === 0 || dayOfWeek === 6) return 100;
  
  const workDayIndex = dayOfWeek - 1;
  const dayProgress = hour / 24;
  
  return Math.round(((workDayIndex + dayProgress) / 5) * 100);
};

// ===== Drag & Drop Components =====

interface DraggableTaskProps {
  task: Task;
  children: React.ReactNode;
}

const DraggableTask = ({ task, children }: DraggableTaskProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: { type: 'task', task }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...listeners} 
      {...attributes}
      className={cn(isDragging && "opacity-50 cursor-grabbing", "cursor-grab")}
    >
      {children}
    </div>
  );
};

interface DraggableSubtaskProps {
  subtask: SubtaskFromHook;
  children: React.ReactNode;
}

const DraggableSubtask = ({ subtask, children }: DraggableSubtaskProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `subtask-${subtask.id}`,
    data: { type: 'subtask', subtask }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...listeners} 
      {...attributes}
      className={cn(isDragging && "opacity-50 cursor-grabbing", "cursor-grab")}
    >
      {children}
    </div>
  );
};

interface DroppableDayProps {
  day: Date;
  children: React.ReactNode;
}

const DroppableDay = ({ day, children }: DroppableDayProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${day.toISOString()}`,
    data: { day }
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "transition-all duration-200 rounded-xl",
        isOver && "ring-2 ring-primary/50 ring-inset bg-primary/5"
      )}
    >
      {children}
    </div>
  );
};

// ===== Main Component =====

/**
 * Embedded Calendar View for Dashboard tab
 * Stripped of auth check and page headers - Dashboard handles those
 */
export default function EmbeddedCalendarView() {
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
  
  // Drag & Drop state
  const [activeItem, setActiveItem] = useState<{ 
    type: 'task' | 'subtask'; 
    data: Task | SubtaskFromHook 
  } | null>(null);
  
  // Sensors configuratie met distance threshold
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    })
  );
  
  // Gebruik centrale hook voor filter state
  const { showOnlyMyTasks, setShowOnlyMyTasks, userId } = useGlobalTaskFilter();
  
  // Subtaken via reusable hook
  const { subtasks: mySubtasks, refetch: refetchSubtasks } = useMySubtasks(userId);

  useEffect(() => {
    if (userId) {
      fetchTasks();
      fetchReminders();
    }
  }, [userId]);
  
  // Refetch when filter changes
  useEffect(() => {
    if (userId) {
      fetchTasks();
    }
  }, [showOnlyMyTasks]);

  // Calculate values for animated counters (before early return)
  const allWeekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const weekDays = viewMode === "5" ? allWeekDays.slice(0, 5) : allWeekDays;
  
  const getTasksForDay = (day: Date) => tasks.filter((task) => 
    (task.start_at && isSameDay(parseISO(task.start_at), day)) || (task.due_at && isSameDay(parseISO(task.due_at), day))
  );
  
  const getSubtasksForDay = (day: Date) => mySubtasks.filter((subtask) => 
    subtask.due_at && isSameDay(parseISO(subtask.due_at), day)
  );
  
  const todayTasks = !loading ? getTasksForDay(new Date()).length : 0;
  const todaySubtasks = !loading ? getSubtasksForDay(new Date()).length : 0;
  const urgentCount = !loading ? tasks.filter(t => t.priority === 'high' || t.priority === 'critical').length : 0;

  // Animated counters
  const animatedTodayTasks = useCountUp({ end: todayTasks, duration: 600 });
  const animatedWeekTasks = useCountUp({ end: tasks.length, duration: 600 });
  const animatedReminders = useCountUp({ end: reminders.length, duration: 600 });
  const animatedUrgentTasks = useCountUp({ end: urgentCount, duration: 600 });

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

      let query = supabase
        .from("tasks")
        .select(`
          id, title, description, priority, start_at, due_at, next_action, assignee_id, application_id, recruitment_action_type, category, interview_details,
          profiles!tasks_assignee_id_fkey (name, email)
        `)
        .eq("org_id", userOrgs.org_id)
        .is("deleted_at", null)
        .is("completed_at", null)
        .or("start_at.not.is.null,due_at.not.is.null");
      
      if (showOnlyMyTasks && userId) {
        query = query.eq("assignee_id", userId);
      }
      
      const { data, error } = await query.order("start_at", { ascending: true });

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

  // Real-time listener via standardized hook (AFTER function definitions)
  useRealtimeChannel({
    channelName: 'embedded-calendar-tasks-realtime',
    table: 'tasks',
    onEvent: fetchTasks,
    debounceMs: 200
  });

  useRealtimeChannel({
    channelName: 'embedded-calendar-reminders-realtime',
    table: 'reminders',
    onEvent: fetchReminders,
    debounceMs: 200
  });

  const getRemindersForDay = (day: Date) => reminders.filter((reminder) => isSameDay(parseISO(reminder.at), day));

  const goToPreviousWeek = () => setCurrentWeekStart(addDays(currentWeekStart, -7));
  const goToNextWeek = () => setCurrentWeekStart(addDays(currentWeekStart, 7));
  const goToToday = () => setCurrentWeekStart(startOfWeek(new Date(), { locale: nl, weekStartsOn: 1 }));
  
  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDetailModalOpen(true);
  };

  const handleTaskUpdated = async () => {
    const previousWeekStart = currentWeekStart;
    setLoading(true);
    
    try {
      if (selectedTask) {
        const { data: updatedTask, error: fetchError } = await supabase
          .from("tasks")
          .select("id, start_at, due_at, title")
          .eq("id", selectedTask.id)
          .maybeSingle();
        
        if (fetchError) throw fetchError;
        
        if (updatedTask) {
          const taskDate = updatedTask.start_at 
            ? parseISO(updatedTask.start_at)
            : updatedTask.due_at 
              ? parseISO(updatedTask.due_at)
              : null;
          
          if (taskDate) {
            const newWeekStart = startOfWeek(taskDate, { locale: nl, weekStartsOn: 1 });
            const currentWeekEnd = endOfWeek(currentWeekStart, { locale: nl, weekStartsOn: 1 });
            
            if (taskDate < currentWeekStart || taskDate > currentWeekEnd) {
              setCurrentWeekStart(newWeekStart);
              
              toast({
                title: "Taak verplaatst",
                description: `Genavigeerd naar ${format(taskDate, 'd MMMM yyyy', { locale: nl })}`,
                duration: 8000,
                action: (
                  <ToastAction 
                    altText="Terug naar vorige week" 
                    onClick={() => setCurrentWeekStart(previousWeekStart)}
                  >
                    Terug
                  </ToastAction>
                ),
              });
            }
          }
        }
      }
      
      await fetchTasks();
      
    } catch (error) {
      console.error('[EmbeddedCalendar] handleTaskUpdated failed:', error);
      toast({
        title: "Fout bij bijwerken",
        description: "Kon taakgegevens niet ophalen. Probeer opnieuw.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setDetailModalOpen(false);
    }
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

  // ===== Drag & Drop Handlers =====
  
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeData = active.data.current;
    
    if (activeData?.type === 'task') {
      setActiveItem({ type: 'task', data: activeData.task });
    } else if (activeData?.type === 'subtask') {
      setActiveItem({ type: 'subtask', data: activeData.subtask });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);

    if (!over) return;

    const overId = over.id as string;
    if (!overId.startsWith('day-')) return;

    const targetDayISO = overId.replace('day-', '');
    const targetDay = parseISO(targetDayISO);
    const activeData = active.data.current;

    if (activeData?.type === 'task') {
      await rescheduleTask(activeData.task, targetDay);
    } else if (activeData?.type === 'subtask') {
      await rescheduleSubtask(activeData.subtask, targetDay);
    }
  };

  const rescheduleTask = async (task: Task, newDay: Date) => {
    const currentDate = task.start_at 
      ? format(parseISO(task.start_at), 'yyyy-MM-dd')
      : task.due_at 
        ? format(parseISO(task.due_at), 'yyyy-MM-dd')
        : null;
    const newDate = format(newDay, 'yyyy-MM-dd');
    
    if (currentDate === newDate) return;
    
    const originalDateDisplay = task.start_at 
      ? format(parseISO(task.start_at), 'EEEE d MMM', { locale: nl })
      : task.due_at 
        ? format(parseISO(task.due_at), 'EEEE d MMM', { locale: nl })
        : 'onbekend';
    
    const updates: Record<string, string> = {};
    
    if (task.start_at) {
      const originalStart = parseISO(task.start_at);
      const newStart = new Date(newDay);
      newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);
      updates.start_at = newStart.toISOString();
    }
    
    if (task.due_at) {
      const originalDue = parseISO(task.due_at);
      const newDue = new Date(newDay);
      newDue.setHours(originalDue.getHours(), originalDue.getMinutes(), 0, 0);
      updates.due_at = newDue.toISOString();
    }

    if (!task.start_at && !task.due_at) {
      const noon = new Date(newDay);
      noon.setHours(12, 0, 0, 0);
      updates.due_at = noon.toISOString();
    }

    const { error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', task.id);

    if (error) {
      toast({ title: "Fout", description: "Kon taak niet verplaatsen", variant: "destructive" });
      return;
    }

    setTasks(prev => prev.map(t => 
      t.id === task.id ? { ...t, ...updates } : t
    ));

    const newDateDisplay = format(newDay, 'EEEE d MMM', { locale: nl });
    
    toast({ 
      title: "Taak verplaatst", 
      description: `${task.title} → ${newDateDisplay}`,
      duration: 5000,
    });
  };

  const rescheduleSubtask = async (subtask: SubtaskFromHook, newDay: Date) => {
    const currentDate = subtask.due_at ? format(parseISO(subtask.due_at), 'yyyy-MM-dd') : null;
    const newDate = format(newDay, 'yyyy-MM-dd');
    
    if (currentDate === newDate) return;
    
    const originalDue = subtask.due_at ? parseISO(subtask.due_at) : new Date();
    const newDue = new Date(newDay);
    newDue.setHours(originalDue.getHours(), originalDue.getMinutes(), 0, 0);
    const newDueISO = newDue.toISOString();

    const { error } = await supabase
      .from('subtasks')
      .update({ due_at: newDueISO })
      .eq('id', subtask.id);

    if (error) {
      toast({ title: "Fout", description: "Kon subtaak niet verplaatsen", variant: "destructive" });
      return;
    }

    refetchSubtasks();

    const newDateDisplay = format(newDay, 'EEEE d MMM', { locale: nl });
    
    toast({ 
      title: "Subtaak verplaatst", 
      description: `${subtask.title} → ${newDateDisplay}`,
      duration: 5000,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Kalender laden...</p>
      </div>
    );
  }

  const weekNumber = getWeek(currentWeekStart, { locale: nl });

  return (
    <div className="space-y-6">
      {/* Minimal Header - embedded version */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground/80">
            Week {weekNumber} · {tasks.length} taken
            {showOnlyMyTasks && mySubtasks.length > 0 && ` + ${mySubtasks.length} subtaken`}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Mijn taken / Alle taken toggle */}
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
            <Button 
              variant={showOnlyMyTasks ? "default" : "ghost"} 
              size="sm"
              onClick={() => setShowOnlyMyTasks(true)}
              className="gap-1.5 h-8 px-3 text-sm"
            >
              <User className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Mijn taken</span>
            </Button>
            <Button 
              variant={!showOnlyMyTasks ? "default" : "ghost"} 
              size="sm"
              onClick={() => setShowOnlyMyTasks(false)}
              className="gap-1.5 h-8 px-3 text-sm"
            >
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Alle taken</span>
            </Button>
          </div>
          
          {/* View Toggle */}
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
      </div>

      {/* KPI Cards */}
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
          }}
        />
      </div>

      {/* Week Navigation with Progress Bar */}
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
        
        {/* Week Progress Bar */}
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

      {/* Calendar Grid with Drag & Drop */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className={cn(
          "grid gap-3",
          viewMode === "5" 
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5" 
            : "grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7"
        )}>
          {weekDays.map((day) => {
            const dayTasks = getTasksForDay(day);
            const dayReminders = getRemindersForDay(day);
            const daySubtasks = showOnlyMyTasks ? getSubtasksForDay(day) : [];
            const isToday = isSameDay(day, new Date());
            const dayOfWeek = day.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const hasContent = dayTasks.length > 0 || dayReminders.length > 0 || daySubtasks.length > 0;

            return (
              <DroppableDay key={day.toISOString()} day={day}>
                <Card 
                  className={cn(
                    "overflow-hidden min-h-[280px] border border-border/20 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]",
                    isToday && "bg-primary/[0.03] border-primary/10",
                    isWeekend && !isToday && "bg-muted/[0.02] dark:bg-muted/[0.04]"
                  )}
                >
                  <CardHeader className="pb-2 pt-3 px-3">
                    <CardTitle className="text-sm font-normal tracking-wide flex items-center justify-between">
                      <span className={cn(
                        "flex items-center gap-2",
                        isToday && "text-primary font-medium"
                      )}>
                        {format(day, 'EEE', { locale: nl })}
                        <span className={cn(
                          "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs",
                          isToday 
                            ? "bg-primary text-primary-foreground font-semibold" 
                            : "text-muted-foreground"
                        )}>
                          {format(day, 'd')}
                        </span>
                      </span>
                      <button 
                        onClick={() => handleDayClick(day)}
                        className="p-1 rounded-full text-muted-foreground/50 hover:text-primary hover:bg-primary/5 transition-colors"
                        title="Nieuwe taak"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-2 space-y-1">
                    {!hasContent && (
                      <div className="flex flex-col items-center justify-center py-4 text-muted-foreground/30">
                        {(() => {
                          const { icon: EmptyIcon, message } = getEmptyStateMessage(day, isWeekend);
                          return (
                            <>
                              <EmptyIcon className="h-5 w-5 mb-1" />
                              <span className="text-[11px]">{message}</span>
                            </>
                          );
                        })()}
                      </div>
                    )}
                    
                    {/* Tasks */}
                    {dayTasks.map((task) => {
                      const isInterview = isInterviewTask(task);
                      const taskIsOverdue = isOverdue(task);
                      const priority = task.priority?.toLowerCase() || 'medium';
                      
                      return (
                        <DraggableTask key={task.id} task={task}>
                          <div
                            onClick={() => handleTaskClick(task)}
                            data-urgent-task={priority === 'high' || priority === 'critical' ? true : undefined}
                            className={cn(
                              "p-2 rounded-lg border-l-2 cursor-pointer transition-all duration-150",
                              "hover:shadow-sm hover:scale-[1.01]",
                              isInterview ? INTERVIEW_STYLES.bg : PRIORITY_BG[priority],
                              isInterview ? INTERVIEW_STYLES.border : PRIORITY_BORDERS[priority],
                              taskIsOverdue && "ring-1 ring-red-500/30"
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <span className={cn(
                                "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                                isInterview ? INTERVIEW_STYLES.dot : PRIORITY_DOTS[priority]
                              )} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{task.title}</p>
                                {task.start_at && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {format(parseISO(task.start_at), 'HH:mm')}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </DraggableTask>
                      );
                    })}
                    
                    {/* Subtasks */}
                    {daySubtasks.map((subtask) => (
                      <DraggableSubtask key={subtask.id} subtask={subtask}>
                        <div className="p-2 rounded-lg bg-secondary/50 border-l-2 border-l-secondary cursor-grab">
                          <p className="text-xs truncate">{subtask.title}</p>
                          {subtask.due_at && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {format(parseISO(subtask.due_at), 'HH:mm')}
                            </p>
                          )}
                        </div>
                      </DraggableSubtask>
                    ))}
                    
                    {/* Reminders */}
                    {dayReminders.map((reminder) => (
                      <div
                        key={reminder.id}
                        data-reminders
                        className="p-2 rounded-lg bg-amber-50/50 dark:bg-amber-900/10 border-l-2 border-l-amber-500/50 flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Clock className="h-3 w-3 text-amber-600 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs truncate">
                              {reminder.title || reminder.tasks?.title || reminder.subtasks?.title || 'Herinnering'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(parseISO(reminder.at), 'HH:mm')}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDeleteReminder(reminder.id, e)}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </DroppableDay>
            );
          })}
        </div>
        
        {/* Drag Overlay */}
        <DragOverlay>
          {activeItem && (
            <div className="p-2 rounded-lg bg-background border shadow-lg opacity-90">
              <p className="text-xs font-medium">
                {activeItem.type === 'task' 
                  ? (activeItem.data as Task).title 
                  : (activeItem.data as SubtaskFromHook).title
                }
              </p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
          onTaskUpdated={handleTaskUpdated}
        />
      )}

      {/* New Task Dialog */}
      <TaskDialog
        open={newTaskDialogOpen}
        onOpenChange={setNewTaskDialogOpen}
        onSuccess={handleNewTaskCreated}
        defaultStartDate={newTaskDate || undefined}
      />
    </div>
  );
}
