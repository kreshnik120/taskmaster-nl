import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, differenceInDays } from "date-fns";
import { nl } from "date-fns/locale";
import { Loader2, AlertCircle, Clock, TrendingUp, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAiScoring } from "@/hooks/useAiScoring";

interface Task {
  id: string;
  title: string;
  description?: string | null;
  priority: string;
  start_at: string | null;
  due_at: string | null;
  next_action: string | null;
  completed_at: string | null;
  estimate_min: number | null;
  org_id: string;
  organizations: { name: string } | null;
  profiles: { name: string | null } | null;
  task_scoring_metadata?: {
    estimated_value_eur: number | null;
    complexity_score: number | null;
    business_impact_score: number | null;
    market_demand_factor: number | null;
  } | null;
}

interface PriorityScore {
  task_id: string;
  priority_score: number;
  rank: number;
  breakdown: {
    klant_impact: number;
    omzet_bescherming: number;
    overgang_voorbereiding: number;
    compliance: number;
    operationeel: number;
  };
  label: "NORMAL" | "CRITICAL" | "LOW_PRIORITY";
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


type FilterType = "achterstallig" | "deze-week" | "met-actie" | null;

export default function Opvolging() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Use the smart caching hook
  const { 
    priorityScores, 
    loading: scoringLoading,
    getScoreForTask,
    calculateScores
  } = useAiScoring(tasks, true);

  // Force AI calculation if tasks are loaded but no scores exist
  useEffect(() => {
    if (tasks.length > 0 && priorityScores.size === 0 && !scoringLoading) {
      console.log('🚀 No AI scores found, triggering calculation for', tasks.length, 'tasks');
      calculateScores(tasks);
    }
  }, [tasks.length, priorityScores.size, scoringLoading]);

  useEffect(() => {
    checkAuth();
    fetchTasks();

    // Subscribe to real-time updates with debouncing
    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
        },
        (payload) => {
          // Only refetch for relevant events
          if (['INSERT', 'UPDATE', 'DELETE'].includes(payload.eventType)) {
            // Debounce refetch to prevent cascade updates
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = setTimeout(() => {
              console.log('🔄 Real-time update detected, refetching tasks');
              fetchTasks();
            }, 300);
          }
        }
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
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
          description,
          priority,
          start_at,
          due_at,
          next_action,
          completed_at,
          estimate_min,
          org_id,
          organizations(name),
          profiles:profiles!tasks_assignee_id_fkey(name),
          task_scoring_metadata(estimated_value_eur, complexity_score, business_impact_score, market_demand_factor)
        `)
        .is("completed_at", null)
        .is("deleted_at", null)
        .order("due_at", { ascending: true });

      if (error) throw error;
      setTasks(data || []);
      
      // useAiScoring hook will automatically handle scoring
    } catch (error) {
      console.error("Error fetching tasks:", error);
      toast({
        title: "Fout bij ophalen taken",
        description: "Er is een fout opgetreden bij het ophalen van de taken.",
        variant: "destructive",
      });
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

  const allFocusTasks = [...tasks]
    .map((task) => {
      const scoreData = getScoreForTask(task.id);
      return {
        ...task,
        priorityScore: scoreData?.priority_score ?? 0,
        scoreBreakdown: scoreData?.breakdown,
        scoreLabel: scoreData?.label,
        rank: scoreData?.rank,
        aiExplanation: scoreData?.explanation
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 10);

  // Filter tasks based on active filter
  const focusTasks = activeFilter
    ? allFocusTasks.filter((task) => {
        if (activeFilter === "achterstallig") {
          return task.due_at && new Date(task.due_at) < new Date();
        }
        if (activeFilter === "deze-week") {
          return (
            task.due_at &&
            new Date(task.due_at) >= new Date() &&
            differenceInDays(new Date(task.due_at), new Date()) <= 7
          );
        }
        if (activeFilter === "met-actie") {
          return task.next_action;
        }
        return true;
      })
    : allFocusTasks;

  const isTaskInCategory = (task: Task, category: FilterType): boolean => {
    if (category === "achterstallig") {
      return !!(task.due_at && new Date(task.due_at) < new Date());
    }
    if (category === "deze-week") {
      return !!(
        task.due_at &&
        new Date(task.due_at) >= new Date() &&
        differenceInDays(new Date(task.due_at), new Date()) <= 7
      );
    }
    if (category === "met-actie") {
      return !!task.next_action;
    }
    return false;
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
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Opvolging</h1>
            <p className="text-muted-foreground">
              Taken die je aandacht vereisen
            </p>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <Card 
              className={`cursor-pointer transition-all hover:shadow-md ${
                activeFilter === "achterstallig" 
                  ? "ring-2 ring-destructive bg-destructive/5" 
                  : "hover:bg-muted/50"
              }`}
              onClick={() => setActiveFilter(activeFilter === "achterstallig" ? null : "achterstallig")}
            >
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

            <Card 
              className={`cursor-pointer transition-all hover:shadow-md ${
                activeFilter === "deze-week" 
                  ? "ring-2 ring-primary bg-primary/5" 
                  : "hover:bg-muted/50"
              }`}
              onClick={() => setActiveFilter(activeFilter === "deze-week" ? null : "deze-week")}
            >
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

            <Card 
              className={`cursor-pointer transition-all hover:shadow-md ${
                activeFilter === "met-actie" 
                  ? "ring-2 ring-accent bg-accent/5" 
                  : "hover:bg-muted/50"
              }`}
              onClick={() => setActiveFilter(activeFilter === "met-actie" ? null : "met-actie")}
            >
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
                <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle>Top 10 Focus Taken</CardTitle>
                    <CardDescription>
                      {activeFilter 
                        ? `Gefilterd op: ${
                            activeFilter === "achterstallig" ? "Achterstallige taken" :
                            activeFilter === "deze-week" ? "Deze week" :
                            "Taken met actie"
                          }`
                        : "Taken geanalyseerd en gescoord met AI (Google Gemini 2.5 Flash)"
                      }
                    </CardDescription>
                  </div>
                </div>
                  {activeFilter && (
                    <button
                      onClick={() => setActiveFilter(null)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
                    >
                      Alle taken tonen
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {scoringLoading && (
                  <div className="flex items-center justify-center py-4 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    AI analyseert taken...
                  </div>
                )}
                <div className="space-y-4">
                  {focusTasks.length === 0 ? (
                    <p className="text-center text-muted-foreground">
                      Geen taken gevonden voor dit filter
                    </p>
                  ) : (
                    focusTasks.map((task) => {
                      const taskHighlightClass = 
                        activeFilter === "achterstallig" && isTaskInCategory(task, "achterstallig") ? "bg-destructive/10 border-destructive/50" :
                        activeFilter === "deze-week" && isTaskInCategory(task, "deze-week") ? "bg-primary/10 border-primary/50" :
                        activeFilter === "met-actie" && isTaskInCategory(task, "met-actie") ? "bg-accent/10 border-accent/50" :
                        task.scoreLabel === "CRITICAL" ? "bg-destructive/10 border-destructive/50" :
                        task.scoreLabel === "LOW_PRIORITY" ? "bg-muted/50" :
                        "";
                      
                      return (
                        <div
                          key={task.id}
                          className={`flex items-center gap-4 rounded-lg border p-4 hover:bg-muted/50 cursor-pointer transition-all ${taskHighlightClass}`}
                        >
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              {task.rank && (
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                                  {task.rank}
                                </span>
                              )}
                              <p className="font-medium">{task.title}</p>
                              <Badge className={priorityColors[task.priority as keyof typeof priorityColors]}>
                                {priorityLabels[task.priority as keyof typeof priorityLabels]}
                              </Badge>
                              {task.scoreLabel === "CRITICAL" && (
                                <Badge variant="destructive" className="ml-1">
                                  Kritiek
                                </Badge>
                              )}
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
                                  {task.priorityScore === 0 ? (
                                    <div className="flex flex-col items-center gap-1">
                                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                      <div className="text-xs text-muted-foreground">
                                        Berekenen...
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="text-2xl font-bold text-primary">
                                        {task.priorityScore}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        prioriteits score
                                      </div>
                                    </>
                                  )}
                                  {task.scoreBreakdown && (
                                    <div className="mt-2 space-y-1">
                                      {task.scoreBreakdown.klant_impact > 0 && (
                                        <Progress value={task.scoreBreakdown.klant_impact * 100} className="h-1" />
                                      )}
                                      {task.scoreBreakdown.omzet_bescherming > 0 && (
                                        <Progress value={task.scoreBreakdown.omzet_bescherming * 100} className="h-1" />
                                      )}
                                      {task.scoreBreakdown.overgang_voorbereiding > 0 && (
                                        <Progress value={task.scoreBreakdown.overgang_voorbereiding * 100} className="h-1" />
                                      )}
                                    </div>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-md">
                                <div className="space-y-3">
                                  {task.aiExplanation && (
                                    <div className="pb-3 border-b">
                                      <p className="font-semibold mb-2 flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 text-primary" />
                                        Waarom belangrijk?
                                      </p>
                                      <p className="text-sm leading-relaxed">
                                        {task.aiExplanation}
                                      </p>
                                    </div>
                                  )}
                                  <div>
                                    <p className="font-semibold mb-2">AI Score Breakdown:</p>
                                    {task.scoreBreakdown ? (
                                      <div className="space-y-1 text-sm">
                                        <div className="flex justify-between">
                                          <span>🏥 Klant Impact:</span>
                                          <span className="font-medium">{Math.round(task.scoreBreakdown.klant_impact || 0)}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span>💰 Omzet Bescherming:</span>
                                          <span className="font-medium">{Math.round(task.scoreBreakdown.omzet_bescherming || 0)}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span>⏰ Overgang Voorbereiding:</span>
                                          <span className="font-medium">{Math.round(task.scoreBreakdown.overgang_voorbereiding || 0)}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span>✅ Compliance:</span>
                                          <span className="font-medium">{Math.round(task.scoreBreakdown.compliance || 0)}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span>🚀 Operationeel:</span>
                                          <span className="font-medium">{Math.round(task.scoreBreakdown.operationeel || 0)}%</span>
                                        </div>
                                        <div className="flex justify-between border-t pt-1 font-semibold">
                                          <span>Totaal Score:</span>
                                          <span>{task.priorityScore}/100</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground">Score wordt berekend...</p>
                                    )}
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
