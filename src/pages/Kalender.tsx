import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { format, startOfWeek, addDays, isSameDay, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Task {
  id: string;
  title: string;
  priority: string;
  start_at: string | null;
  due_at: string | null;
}

const priorityColors = {
  LOW: "bg-priority-low",
  MEDIUM: "bg-priority-medium",
  HIGH: "bg-priority-high",
  CRITICAL: "bg-priority-critical",
};

export default function Kalender() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { locale: nl, weekStartsOn: 1 }));

  useEffect(() => {
    checkAuth();
    fetchTasks();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, priority, start_at, due_at")
        .or("start_at.not.is.null,due_at.not.is.null")
        .order("start_at", { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));

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
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold">Kalender</h1>
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

          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day) => {
              const dayTasks = getTasksForDay(day);
              const isToday = isSameDay(day, new Date());

              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[400px] rounded-lg border bg-card p-4 ${
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
                      dayTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`rounded-md border-l-4 ${
                            priorityColors[task.priority as keyof typeof priorityColors]
                          } bg-muted/50 p-2 hover:bg-muted cursor-pointer transition-colors`}
                        >
                          <p className="text-sm font-medium line-clamp-2">{task.title}</p>
                          {task.start_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Start: {format(parseISO(task.start_at), "HH:mm")}
                            </p>
                          )}
                          {task.due_at && (
                            <p className="text-xs text-muted-foreground">
                              Eind: {format(parseISO(task.due_at), "HH:mm")}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
