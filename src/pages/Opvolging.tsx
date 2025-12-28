import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, differenceInDays } from "date-fns";
import { nl } from "date-fns/locale";
import { Loader2, Clock, AlertCircle, Calendar, CheckCircle2, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useCountUp } from "@/hooks/useCountUp";
import { useAiScoring } from "@/hooks/useAiScoring";
import { KPICard } from "@/components/ui/kpi-card";

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
  application_id: string | null;
  recruitment_action_type: string | null;
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
    getScoreForTask
  } = useAiScoring(tasks, true);

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
              logger.log('🔄 Real-time update detected, refetching tasks');
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
          application_id,
          recruitment_action_type,
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
      logger.error("Error fetching tasks:", error);
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

  // Calculate average AI score
  const avgScore = focusTasks.length > 0 
    ? Math.round(focusTasks.reduce((sum, t) => sum + t.priorityScore, 0) / focusTasks.length)
    : 0;
  const criticalCount = focusTasks.filter(t => t.scoreLabel === "CRITICAL").length;

  // Animated counters
  const animatedOverdueTasks = useCountUp({ end: overdueTasks.length, duration: 600 });
  const animatedUpcomingTasks = useCountUp({ end: upcomingTasks.length, duration: 600 });
  const animatedWithAction = useCountUp({ end: tasksWithNextAction.length, duration: 600 });
  const animatedAvgScore = useCountUp({ end: avgScore, duration: 600 });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Esc = Reset filters
      if (e.key === 'Escape' && activeFilter) {
        e.preventDefault();
        setActiveFilter(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFilter]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Minimal Hero Section */}
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Opvolging</h1>
          <p className="text-muted-foreground">
            {scoringLoading 
              ? `AI analyseert ${tasks.length} taken...`
              : `${focusTasks.length} prioriteiten uit ${tasks.length} taken`
            }
          </p>
        </div>
        
        {/* AI Context - clean card */}
        {(overdueTasks.length > 0 || criticalCount > 0) && (
          <div className="p-3 rounded-lg border bg-card">
            <p className="text-sm text-muted-foreground">
              {overdueTasks.length > 0 && `${overdueTasks.length} achterstallig`}
              {overdueTasks.length > 0 && criticalCount > 0 && ' · '}
              {criticalCount > 0 && `${criticalCount} kritiek`}
            </p>
          </div>
        )}
      </div>

      {/* KPI Cards met Icons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          icon={AlertCircle}
          title="Achterstallig"
          value={animatedOverdueTasks}
          variant="urgent"
          onClick={() => setActiveFilter(activeFilter === "achterstallig" ? null : "achterstallig")}
          className={cn(activeFilter === "achterstallig" && "ring-2 ring-orange-500")}
        />
        <KPICard
          icon={Calendar}
          title="Deze Week"
          value={animatedUpcomingTasks}
          variant="time"
          onClick={() => setActiveFilter(activeFilter === "deze-week" ? null : "deze-week")}
          className={cn(activeFilter === "deze-week" && "ring-2 ring-amber-500")}
        />
        <KPICard
          icon={CheckCircle2}
          title="Met Actie"
          value={animatedWithAction}
          variant="count"
          onClick={() => setActiveFilter(activeFilter === "met-actie" ? null : "met-actie")}
          className={cn(activeFilter === "met-actie" && "ring-2 ring-blue-500")}
        />
        <KPICard
          icon={TrendingUp}
          title="Gem. AI Score"
          value={scoringLoading ? 0 : animatedAvgScore}
          variant="success"
        />
      </div>

      {/* Focus Taken - Top 10 Met Filter */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Top 10 Focus Taken</CardTitle>
                <CardDescription>
                  {activeFilter ? (
                    <span>
                      Gefilterd op: <strong>
                        {activeFilter === "achterstallig" ? "Achterstallige taken" :
                         activeFilter === "deze-week" ? "Deze week" :
                         "Taken met actie"}
                      </strong>
                    </span>
                  ) : (
                    <span>Geanalyseerd met AI prioritering</span>
                  )}
                </CardDescription>
              </div>
              {activeFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveFilter(null)}
                >
                  Reset filter
                </Button>
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
            <div className="space-y-3">
              {focusTasks.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  Geen taken gevonden voor dit filter
                </p>
              ) : (
                focusTasks.map((task) => {
                  const isOverdue = task.due_at && new Date(task.due_at) < new Date();
                  const isCritical = task.scoreLabel === "CRITICAL";
                  
                  return (
                    <div
                      key={task.id}
                      onClick={() => navigate(`/lijst?task=${task.id}`)}
                      className={`flex items-start gap-4 rounded-lg border p-4 hover:bg-muted/50 cursor-pointer transition-all ${
                        isCritical ? "border-destructive/50" : ""
                      }`}
                    >
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          {task.rank && (
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-semibold">
                              {task.rank}
                            </span>
                          )}
                          <p className="font-medium">{task.title}</p>
                          {isOverdue && (
                            <Badge variant="destructive" className="text-xs">
                              Achterstallig
                            </Badge>
                          )}
                        </div>
                        
                        {task.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {task.description}
                          </p>
                        )}

                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {task.due_at && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(task.due_at), "d MMM", { locale: nl })}
                            </span>
                          )}
                          {task.next_action && (
                            <span className="flex items-center gap-1">
                              Volgende actie: {task.next_action}
                            </span>
                          )}
                        </div>

                        {task.aiExplanation && (
                          <p className="text-xs text-muted-foreground italic">
                            {task.aiExplanation}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2 min-w-[100px]">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="text-right">
                                <p className="text-lg font-semibold">
                                  {Math.round(task.priorityScore)}
                                </p>
                                <p className="text-xs text-muted-foreground">AI Score</p>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="w-64">
                              <div className="space-y-2">
                                <p className="font-semibold text-xs">Score Breakdown</p>
                                {task.scoreBreakdown && (
                                  <div className="space-y-1 text-xs">
                                    <div className="flex justify-between">
                                      <span>Klant Impact</span>
                                      <span>{task.scoreBreakdown.klant_impact}/10</span>
                                    </div>
                                    <Progress value={task.scoreBreakdown.klant_impact * 10} className="h-1" />
                                    
                                    <div className="flex justify-between">
                                      <span>Omzet</span>
                                      <span>{task.scoreBreakdown.omzet_bescherming}/10</span>
                                    </div>
                                    <Progress value={task.scoreBreakdown.omzet_bescherming * 10} className="h-1" />
                                    
                                    <div className="flex justify-between">
                                      <span>Compliance</span>
                                      <span>{task.scoreBreakdown.compliance}/10</span>
                                    </div>
                                    <Progress value={task.scoreBreakdown.compliance * 10} className="h-1" />
                                  </div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        {isCritical && (
                          <Badge variant="destructive" className="text-xs">
                            Kritiek
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {overdueTasks.length > 0 && !activeFilter && (
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Achterstallige taken</CardTitle>
              <CardDescription>
                Deze taken vereisen directe aandacht
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {overdueTasks.slice(0, 5).map((task) => (
                  <div
                    key={task.id}
                    onClick={() => navigate(`/lijst?task=${task.id}`)}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                  >
                    <div>
                      <p className="font-medium">{task.title}</p>
                      {task.due_at && (
                        <p className="text-xs text-muted-foreground">
                          Deadline: {format(new Date(task.due_at), "d MMMM yyyy", { locale: nl })}
                        </p>
                      )}
                    </div>
                    <Badge variant="destructive">
                      {Math.abs(differenceInDays(new Date(task.due_at!), new Date()))} dagen
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
