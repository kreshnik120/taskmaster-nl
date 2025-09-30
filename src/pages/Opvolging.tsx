import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, differenceInDays } from "date-fns";
import { nl } from "date-fns/locale";
import { Loader2, AlertCircle, Clock, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Task {
  id: string;
  title: string;
  priority: string;
  start_at: string | null;
  due_at: string | null;
  next_action: string | null;
  completed_at: string | null;
  organizations: { name: string } | null;
  profiles: { name: string | null } | null;
}

const priorityColors = {
  LOW: "bg-priority-low text-priority-low-foreground",
  MEDIUM: "bg-priority-medium text-priority-medium-foreground",
  HIGH: "bg-priority-high text-priority-high-foreground",
  CRITICAL: "bg-priority-critical text-priority-critical-foreground",
};

const priorityLabels = {
  LOW: "Laag",
  MEDIUM: "Gemiddeld",
  HIGH: "Hoog",
  CRITICAL: "Kritiek",
};

interface ScoreBreakdown {
  priority: number;
  dueDate: number;
  overdue: number;
  startReady: number;
  total: number;
}

const calculateFocusScore = (task: Task): number => {
  let score = 0;

  // Priority weight
  const priorityWeights = { LOW: 0, MEDIUM: 20, HIGH: 40, CRITICAL: 60 };
  score += priorityWeights[task.priority as keyof typeof priorityWeights] || 0;

  // Due date weight
  if (task.due_at) {
    const daysUntil = differenceInDays(new Date(task.due_at), new Date());
    const dueWeight = Math.max(0, Math.min(30, 30 - daysUntil));
    score += dueWeight;

    // Overdue penalty
    if (daysUntil < 0) {
      score += 50;
    }
  }

  // Start ready bonus
  if (task.start_at && new Date(task.start_at) <= new Date()) {
    score += 10;
  }

  return score;
};

const getScoreBreakdown = (task: Task): ScoreBreakdown => {
  const priorityWeights = { LOW: 0, MEDIUM: 20, HIGH: 40, CRITICAL: 60 };
  const priority = priorityWeights[task.priority as keyof typeof priorityWeights] || 0;
  
  let dueDate = 0;
  let overdue = 0;
  if (task.due_at) {
    const daysUntil = differenceInDays(new Date(task.due_at), new Date());
    dueDate = Math.max(0, Math.min(30, 30 - daysUntil));
    if (daysUntil < 0) {
      overdue = 50;
    }
  }
  
  const startReady = (task.start_at && new Date(task.start_at) <= new Date()) ? 10 : 0;
  
  return {
    priority,
    dueDate,
    overdue,
    startReady,
    total: priority + dueDate + overdue + startReady,
  };
};

export default function Opvolging() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
    fetchTasks();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('tasks-changes')
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
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          id,
          title,
          priority,
          start_at,
          due_at,
          next_action,
          completed_at,
          organizations(name),
          profiles:profiles!tasks_assignee_id_fkey(name)
        `)
        .is("completed_at", null)
        .order("due_at", { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const tasksWithNextAction = tasks.filter((t) => t.next_action);
  const overdueTasks = tasks.filter(
    (t) => t.due_at && new Date(t.due_at) < new Date()
  );
  const upcomingTasks = tasks.filter(
    (t) =>
      t.due_at &&
      new Date(t.due_at) >= new Date() &&
      differenceInDays(new Date(t.due_at), new Date()) <= 7
  );

  const focusTasks = [...tasks]
    .map((task) => ({
      ...task,
      focusScore: calculateFocusScore(task),
    }))
    .sort((a, b) => b.focusScore - a.focusScore)
    .slice(0, 10);

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
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Opvolging</h1>
            <p className="text-muted-foreground">
              Taken die je aandacht vereisen
            </p>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Achterstallig</CardTitle>
                <AlertCircle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overdueTasks.length}</div>
                <p className="text-xs text-muted-foreground">
                  taken over deadline
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Deze week</CardTitle>
                <Clock className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{upcomingTasks.length}</div>
                <p className="text-xs text-muted-foreground">
                  taken binnenkort klaar
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Met actie</CardTitle>
                <TrendingUp className="h-4 w-4 text-accent" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tasksWithNextAction.length}</div>
                <p className="text-xs text-muted-foreground">
                  taken met volgende actie
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Focus Taken</CardTitle>
                <CardDescription>
                  Taken gesorteerd op focus score (prioriteit, deadline, startdatum)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {focusTasks.length === 0 ? (
                    <p className="text-center text-muted-foreground">
                      Geen taken gevonden
                    </p>
                  ) : (
                    focusTasks.map((task) => {
                      const breakdown = getScoreBreakdown(task);
                      return (
                        <div
                          key={task.id}
                          className="flex items-center gap-4 rounded-lg border p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                        >
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{task.title}</p>
                              <Badge className={priorityColors[task.priority as keyof typeof priorityColors]}>
                                {priorityLabels[task.priority as keyof typeof priorityLabels]}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              {task.organizations && (
                                <span>{task.organizations.name}</span>
                              )}
                              {task.profiles?.name && (
                                <span>• {task.profiles.name}</span>
                              )}
                              {task.due_at && (
                                <span>
                                  • Deadline:{" "}
                                  {format(new Date(task.due_at), "dd MMM yyyy", { locale: nl })}
                                </span>
                              )}
                            </div>
                            {task.next_action && (
                              <p className="text-sm text-accent">
                                → {task.next_action}
                              </p>
                            )}
                          </div>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="text-right cursor-help">
                                  <div className="text-2xl font-bold text-primary">
                                    {task.focusScore}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    focus score
                                  </div>
                                  <div className="mt-2 space-y-1">
                                    {breakdown.priority > 0 && (
                                      <Progress value={(breakdown.priority / breakdown.total) * 100} className="h-1" />
                                    )}
                                    {breakdown.dueDate > 0 && (
                                      <Progress value={(breakdown.dueDate / breakdown.total) * 100} className="h-1" />
                                    )}
                                    {breakdown.overdue > 0 && (
                                      <Progress value={(breakdown.overdue / breakdown.total) * 100} className="h-1 bg-destructive/20" />
                                    )}
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-xs">
                                <div className="space-y-2">
                                  <p className="font-semibold">Score Breakdown:</p>
                                  <div className="space-y-1 text-sm">
                                    <div className="flex justify-between">
                                      <span>Prioriteit ({priorityLabels[task.priority as keyof typeof priorityLabels]}):</span>
                                      <span className="font-medium">{breakdown.priority} pts</span>
                                    </div>
                                    {breakdown.dueDate > 0 && (
                                      <div className="flex justify-between">
                                        <span>Deadline nabijheid:</span>
                                        <span className="font-medium">{breakdown.dueDate} pts</span>
                                      </div>
                                    )}
                                    {breakdown.overdue > 0 && (
                                      <div className="flex justify-between text-destructive">
                                        <span>Achterstallig:</span>
                                        <span className="font-medium">+{breakdown.overdue} pts</span>
                                      </div>
                                    )}
                                    {breakdown.startReady > 0 && (
                                      <div className="flex justify-between">
                                        <span>Klaar om te starten:</span>
                                        <span className="font-medium">{breakdown.startReady} pts</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between border-t pt-1 font-semibold">
                                      <span>Totaal:</span>
                                      <span>{breakdown.total} pts</span>
                                    </div>
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            {overdueTasks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-destructive">Achterstallige taken</CardTitle>
                  <CardDescription>
                    Deze taken zijn over de deadline
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {overdueTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/5 p-3"
                      >
                        <div>
                          <p className="font-medium">{task.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {task.due_at &&
                              `${Math.abs(differenceInDays(new Date(task.due_at), new Date()))} dagen te laat`}
                          </p>
                        </div>
                        <Badge className={priorityColors[task.priority as keyof typeof priorityColors]}>
                          {priorityLabels[task.priority as keyof typeof priorityLabels]}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
