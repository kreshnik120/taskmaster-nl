import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { format, startOfWeek, endOfDay, startOfDay, addDays, isSameDay, parseISO, getWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { Loader2, ChevronLeft, ChevronRight, User, Bell, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { useToast } from "@/hooks/use-toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PriorityBadge } from "@/components/PriorityBadge";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  start_at: string | null;
  due_at: string | null;
  next_action: string | null;
  assignee_id: string | null;
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
  LOW: { label: "Laag", variant: "outline" as const, color: "border-l-priority-low" },
  MEDIUM: { label: "Normaal", variant: "secondary" as const, color: "border-l-priority-medium" },
  HIGH: { label: "Hoog", variant: "default" as const, color: "border-l-priority-high" },
  CRITICAL: { label: "Kritiek", variant: "destructive" as const, color: "border-l-priority-critical" },
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
  const [viewMode, setViewMode] = useState<"5" | "7">("5"); // 5-dag of 7-dag weergave

  useEffect(() => {
    checkAuth();
    fetchTasks();
    fetchReminders();
  }, []);

  // Real-time updates voor tasks en reminders
  useEffect(() => {
    const tasksChannel = supabase
      .channel('kalender-tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
        },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    const remindersChannel = supabase
      .channel('kalender-reminders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reminders'
        },
        () => {
          fetchReminders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(remindersChannel);
    };
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchTasks = async () => {
    try {
      // Get user's organization
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
          id,
          title,
          description,
          priority,
          start_at,
          due_at,
          next_action,
          assignee_id,
          profiles!tasks_assignee_id_fkey (
            name,
            email
          )
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
      toast({
        title: "Fout bij laden",
        description: "Kon taken niet laden. Probeer het opnieuw.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchReminders = async () => {
    try {
      // ⚡ OPTIMIZED: Only fetch shown reminders for current week (uses idx_reminders_task_subtask_shown)
      const startOfWeek = startOfDay(currentWeekStart);
      const endOfWeek = endOfDay(addDays(currentWeekStart, 6));

      const { data, error } = await supabase
        .from("reminders")
        .select(`
          *,
          tasks:task_id(title),
          subtasks:subtask_id(title)
        `)
        .not("shown_at", "is", null)
        .gte("at", startOfWeek.toISOString())
        .lte("at", endOfWeek.toISOString())
        .order("at", { ascending: true })
        .limit(100);

      if (error) throw error;
      setReminders(data || []);
    } catch (error) {
      console.error("⚠️ Error fetching reminders:", error);
    }
  };

  const allWeekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const weekDays = viewMode === "5" ? allWeekDays.slice(0, 5) : allWeekDays; // Ma-Vr of Ma-Zo

  const getTasksForDay = (day: Date) => {
    return tasks.filter((task) => {
      if (task.start_at && isSameDay(parseISO(task.start_at), day)) return true;
      if (task.due_at && isSameDay(parseISO(task.due_at), day)) return true;
      return false;
    });
  };

  const getRemindersForDay = (day: Date) => {
    return reminders.filter((reminder) => {
      return isSameDay(parseISO(reminder.at), day);
    });
  };

  const goToPreviousWeek = () => {
    setCurrentWeekStart(addDays(currentWeekStart, -7));
  };

  const goToNextWeek = () => {
    setCurrentWeekStart(addDays(currentWeekStart, 7));
  };

  const goToToday = () => {
    setCurrentWeekStart(startOfWeek(new Date(), { locale: nl, weekStartsOn: 1 }));
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDetailModalOpen(true);
  };

  const handleTaskUpdated = () => {
    fetchTasks();
    setDetailModalOpen(false);
  };

  const handleDeleteReminder = async (reminderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      const { error } = await supabase
        .from('reminders')
        .delete()
        .eq('id', reminderId);

      if (error) throw error;

      toast({
        title: "Herinnering verwijderd",
        description: "De herinnering is succesvol verwijderd.",
      });

      fetchReminders();
    } catch (error) {
      console.error('Error deleting reminder:', error);
      toast({
        title: "Fout",
        description: "Er is een fout opgetreden bij het verwijderen van de herinnering.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto bg-background p-6">
          <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
            <h1 className="text-3xl font-bold">
              Kalender - {format(currentWeekStart, "MMMM yyyy", { locale: nl })}, Week {getWeek(currentWeekStart, { locale: nl })}
            </h1>
            <div className="flex items-center gap-4 flex-wrap">
              <ToggleGroup type="single" value={viewMode} onValueChange={(value) => value && setViewMode(value as "5" | "7")}>
                <ToggleGroupItem value="5" aria-label="Werkweek" className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                  Werkweek (Ma-Vr)
                </ToggleGroupItem>
                <ToggleGroupItem value="7" aria-label="Volle week" className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                  Volle week (Ma-Zo)
                </ToggleGroupItem>
              </ToggleGroup>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={goToPreviousWeek}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToToday}>
                  Vandaag
                </Button>
                <Button variant="outline" size="sm" onClick={goToNextWeek}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className={`grid ${viewMode === "5" ? "grid-cols-5" : "grid-cols-7"} gap-4`}>
            {weekDays.map((day) => {
              const dayTasks = getTasksForDay(day);
              const isToday = isSameDay(day, new Date());

              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[500px] rounded-lg border bg-card p-4 ${
                    isToday ? "border-primary ring-2 ring-primary/20" : ""
                  }`}
                >
                  <div className="mb-4 text-center">
                    <div className="text-sm font-medium text-muted-foreground">
                      {format(day, "EEEE", { locale: nl })}
                    </div>
                    <div className={`text-2xl font-bold ${isToday ? "text-primary" : ""}`}>
                      {format(day, "d", { locale: nl })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(day, "MMM yyyy", { locale: nl })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {dayTasks.length === 0 && getRemindersForDay(day).length === 0 ? (
                      <p className="text-center text-sm text-muted-foreground">
                        Geen taken
                      </p>
                    ) : (
                      <>
                        {dayTasks.map((task) => {
                          const priorityInfo = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.MEDIUM;
                          const taskReminders = getRemindersForDay(day).filter(r => r.task_id === task.id);
                          
                          return (
                            <div key={task.id} className="space-y-1">
                              {/* Main Task */}
                              <div
                                onClick={() => handleTaskClick(task)}
                                className={`rounded-md border-l-4 ${priorityInfo.color} bg-card p-3 hover:shadow-lg hover:scale-[1.02] cursor-pointer transition-all duration-200 space-y-2`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-semibold flex-1 break-words">{task.title}</p>
                                  <PriorityBadge taskId={task.id} priority={task.priority} size="sm" />
                                </div>
                                
                                {task.profiles && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <User className="h-3 w-3" />
                                    <span className="truncate">{task.profiles.name || task.profiles.email}</span>
                                  </div>
                                )}
                                
                                <div className="space-y-1">
                                  {task.start_at && (
                                    <p className="text-xs text-muted-foreground">
                                      ⏰ {format(parseISO(task.start_at), "HH:mm")}
                                    </p>
                                  )}
                                  {task.due_at && (
                                    <p className="text-xs text-muted-foreground">
                                      ⏱️ {format(parseISO(task.due_at), "HH:mm")}
                                    </p>
                                  )}
                                </div>
                                
                                {task.next_action && (
                                  <p className="text-xs text-primary font-medium break-words">
                                    → {task.next_action}
                                  </p>
                                )}
                              </div>

                              {/* Reminders for this task - shown smaller beneath */}
                              {taskReminders.map((reminder) => (
                                <div
                                  key={reminder.id}
                                  className={`group ml-4 rounded border-l-2 ${priorityInfo.color} bg-primary/5 p-1.5 px-2 hover:bg-primary/10 transition-colors relative`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <Bell className="w-3 h-3 text-primary flex-shrink-0" />
                                    <p className="text-[11px] font-medium text-primary/90 truncate flex-1">
                                      {reminder.title || "Herinnering"}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {format(parseISO(reminder.at), "HH:mm")}
                                    </p>
                                    <button
                                      onClick={(e) => handleDeleteReminder(reminder.id, e)}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-destructive/10 rounded"
                                      title="Verwijder herinnering"
                                    >
                                      <X className="w-3 h-3 text-destructive" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}

                        {/* Standalone Reminders (not linked to displayed tasks) */}
                        {getRemindersForDay(day)
                          .filter(reminder => !dayTasks.some(task => task.id === reminder.task_id))
                          .map((reminder) => (
                            <div
                              key={reminder.id}
                              className="group rounded border-l-2 border-l-primary/50 bg-primary/5 p-2 hover:bg-primary/10 transition-colors relative"
                            >
                              <div className="flex items-center gap-2">
                                <Bell className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-primary/90 truncate">
                                    {reminder.title || reminder.tasks?.title || reminder.subtasks?.title}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {format(parseISO(reminder.at), "HH:mm")}
                                  </p>
                                </div>
                                <button
                                  onClick={(e) => handleDeleteReminder(reminder.id, e)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-destructive/10 rounded"
                                  title="Verwijder herinnering"
                                >
                                  <Trash2 className="w-3 h-3 text-destructive" />
                                </button>
                              </div>
                            </div>
                          ))}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>

      <TaskDetailModal
        task={selectedTask}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onTaskUpdated={handleTaskUpdated}
      />
    </SidebarProvider>
  );
}
