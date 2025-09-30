import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { format, startOfWeek, addDays, isSameDay, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { Loader2, ChevronLeft, ChevronRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { useToast } from "@/hooks/use-toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { locale: nl, weekStartsOn: 1 }));
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"5" | "7">("5"); // 5-dag of 7-dag weergave

  useEffect(() => {
    checkAuth();
    fetchTasks();
  }, []);

  // Real-time updates voor tasks
  useEffect(() => {
    const channel = supabase
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

    return () => {
      supabase.removeChannel(channel);
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

  const allWeekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const weekDays = viewMode === "5" ? allWeekDays.slice(0, 5) : allWeekDays; // Ma-Vr of Ma-Zo

  const getTasksForDay = (day: Date) => {
    return tasks.filter((task) => {
      if (task.start_at && isSameDay(parseISO(task.start_at), day)) return true;
      if (task.due_at && isSameDay(parseISO(task.due_at), day)) return true;
      return false;
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
            <h1 className="text-3xl font-bold">Kalender</h1>
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
                    {dayTasks.length === 0 ? (
                      <p className="text-center text-sm text-muted-foreground">
                        Geen taken
                      </p>
                    ) : (
                      dayTasks.map((task) => {
                        const priorityInfo = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.MEDIUM;
                        
                        return (
                          <div
                            key={task.id}
                            onClick={() => handleTaskClick(task)}
                            className={`rounded-md border-l-4 ${priorityInfo.color} bg-card p-3 hover:shadow-lg hover:scale-[1.02] cursor-pointer transition-all duration-200 space-y-2`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-semibold flex-1 break-words">{task.title}</p>
                              <Badge variant={priorityInfo.variant} className="text-xs shrink-0">
                                {priorityInfo.label}
                              </Badge>
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
                        );
                      })
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
