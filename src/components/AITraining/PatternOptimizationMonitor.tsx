import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Gauge, 
  RefreshCw, 
  ThumbsDown, 
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Zap,
  XCircle,
  PlayCircle,
  PauseCircle
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

interface PatternMetrics {
  id: string;
  keywords: string[];
  table_name: string;
  confidence_score: number;
  usage_count: number;
  success_count: number;
  error_count: number;
  consecutive_errors: number;
  helpful_count: number;
  harmful_count: number;
  avg_response_time_ms: number;
  last_used_at: string | null;
  is_active: boolean;
  deactivation_reason: string | null;
  deactivated_at: string | null;
  auto_reactivation_eligible: boolean;
}

function calculateHealthScore(p: PatternMetrics): number {
  let score = 100;
  
  // Response time penalty
  if (p.avg_response_time_ms > 1000) score -= 40;
  else if (p.avg_response_time_ms > 500) score -= 20;
  
  // Error rate penalty
  const total = p.success_count + p.error_count;
  if (total >= 5) {
    const errorRate = p.error_count / total;
    if (errorRate >= 0.30) score -= 40;
    else if (errorRate >= 0.20) score -= 20;
  }
  
  // Consecutive errors penalty
  if (p.consecutive_errors >= 3) score -= 30;
  
  // Harmful feedback penalty
  if (p.harmful_count > p.helpful_count) {
    const ratio = p.harmful_count / Math.max(1, p.helpful_count);
    score -= Math.min(40, ratio * 10);
  }
  
  // Low confidence penalty
  if (p.confidence_score < 0.50) score -= 20;
  
  // Stale penalty
  if (p.last_used_at) {
    const daysSince = (Date.now() - new Date(p.last_used_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince >= 14) score -= 15;
  }
  
  return Math.max(0, score);
}

function getHealthColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  if (score >= 40) return "text-orange-600";
  return "text-red-600";
}

function getHealthBadge(score: number) {
  if (score >= 80) return <Badge variant="default" className="bg-green-500">Gezond</Badge>;
  if (score >= 60) return <Badge variant="default" className="bg-yellow-500">Matig</Badge>;
  if (score >= 40) return <Badge variant="default" className="bg-orange-500">Risico</Badge>;
  return <Badge variant="destructive">Kritiek</Badge>;
}

export function PatternOptimizationMonitor() {
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState("overview");

  // Fetch all patterns with metrics
  const { data: patterns, isLoading, refetch } = useQuery({
    queryKey: ["fast-path-patterns-health"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fast_path_patterns")
        .select("id, keywords, table_name, confidence_score, usage_count, success_count, error_count, consecutive_errors, helpful_count, harmful_count, avg_response_time_ms, last_used_at, is_active, deactivation_reason, deactivated_at, auto_reactivation_eligible")
        .is("deleted_at", null)
        .order("usage_count", { ascending: false });
      
      if (error) throw error;
      return (data || []) as PatternMetrics[];
    },
    staleTime: 30000
  });

  // Fetch recent auto-optimization logs
  const { data: optimizationLogs } = useQuery({
    queryKey: ["pattern-optimization-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_intelligence")
        .select("id, title, description, data, priority, detected_at")
        .in("intelligence_type", ["fast_path_degradation", "auto_cleanup"])
        .order("detected_at", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000
  });

  // Manual health check trigger
  const triggerHealthCheck = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pattern-health-monitor", {
        body: {}
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Health check voltooid: ${data.result?.healthy || 0}/${data.result?.total_checked || 0} gezond`);
      queryClient.invalidateQueries({ queryKey: ["fast-path-patterns-health"] });
      queryClient.invalidateQueries({ queryKey: ["pattern-optimization-logs"] });
    },
    onError: (error) => {
      toast.error(`Health check mislukt: ${error.message}`);
    }
  });

  // Toggle pattern active status
  const togglePatternStatus = useMutation({
    mutationFn: async ({ id, activate }: { id: string; activate: boolean }) => {
      const { error } = await supabase
        .from("fast_path_patterns")
        .update({
          is_active: activate,
          deactivation_reason: activate ? null : "Handmatig gedeactiveerd",
          deactivated_at: activate ? null : new Date().toISOString(),
          consecutive_errors: activate ? 0 : undefined, // Reset errors on reactivation
          updated_at: new Date().toISOString()
        })
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: (_, { activate }) => {
      toast.success(activate ? "Pattern geactiveerd" : "Pattern gedeactiveerd");
      queryClient.invalidateQueries({ queryKey: ["fast-path-patterns-health"] });
    },
    onError: (error) => {
      toast.error(`Actie mislukt: ${error.message}`);
    }
  });

  const patternsWithHealth = (patterns || []).map(p => ({
    ...p,
    healthScore: calculateHealthScore(p)
  })).sort((a, b) => a.healthScore - b.healthScore);

  const stats = {
    total: patternsWithHealth.length,
    active: patternsWithHealth.filter(p => p.is_active).length,
    healthy: patternsWithHealth.filter(p => p.healthScore >= 80).length,
    warning: patternsWithHealth.filter(p => p.healthScore >= 40 && p.healthScore < 80).length,
    critical: patternsWithHealth.filter(p => p.healthScore < 40).length,
    avgHealth: patternsWithHealth.length > 0 
      ? Math.round(patternsWithHealth.reduce((sum, p) => sum + p.healthScore, 0) / patternsWithHealth.length)
      : 0
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="mt-2 text-muted-foreground">Patterns laden...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              Pattern Optimization Monitor
            </CardTitle>
            <CardDescription>
              Real-time health monitoring en automatische optimalisatie van Fast Path patterns
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => triggerHealthCheck.mutate()}
            disabled={triggerHealthCheck.isPending}
          >
            {triggerHealthCheck.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Activity className="h-4 w-4 mr-2" />
            )}
            Health Check
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Totaal Patterns</div>
          </div>
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{stats.healthy}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Gezond
            </div>
          </div>
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{stats.warning}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Waarschuwing
            </div>
          </div>
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <XCircle className="h-3 w-3" /> Kritiek
            </div>
          </div>
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <div className={`text-2xl font-bold ${getHealthColor(stats.avgHealth)}`}>{stats.avgHealth}%</div>
            <div className="text-xs text-muted-foreground">Gem. Health Score</div>
          </div>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overzicht</TabsTrigger>
            <TabsTrigger value="patterns">Alle Patterns</TabsTrigger>
            <TabsTrigger value="logs">Optimalisatie Log</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {/* Critical Patterns Alert */}
            {stats.critical > 0 && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <span className="font-semibold text-red-600">Kritieke Patterns Gevonden</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  {stats.critical} pattern(s) hebben een health score onder 40% en vereisen aandacht.
                </p>
                <div className="space-y-2">
                  {patternsWithHealth.filter(p => p.healthScore < 40).slice(0, 3).map(p => (
                    <div key={p.id} className="flex items-center justify-between p-2 bg-background rounded border">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-sm ${getHealthColor(p.healthScore)}`}>
                          {p.healthScore}%
                        </span>
                        <span className="text-sm truncate max-w-[200px]">
                          {p.keywords.slice(0, 2).join(", ")}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => togglePatternStatus.mutate({ id: p.id, activate: !p.is_active })}
                      >
                        {p.is_active ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Health Distribution */}
            <div className="p-4 bg-muted/30 rounded-lg">
              <h4 className="font-medium mb-3">Health Score Distributie</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm w-20 text-green-600">Gezond</span>
                  <Progress value={(stats.healthy / Math.max(1, stats.total)) * 100} className="flex-1 h-2" />
                  <span className="text-sm w-10 text-right">{stats.healthy}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm w-20 text-yellow-600">Matig</span>
                  <Progress value={(stats.warning / Math.max(1, stats.total)) * 100} className="flex-1 h-2" />
                  <span className="text-sm w-10 text-right">{stats.warning}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm w-20 text-red-600">Kritiek</span>
                  <Progress value={(stats.critical / Math.max(1, stats.total)) * 100} className="flex-1 h-2" />
                  <span className="text-sm w-10 text-right">{stats.critical}</span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="patterns" className="mt-4">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pattern</TableHead>
                    <TableHead className="text-center">Health</TableHead>
                    <TableHead className="text-center">Usage</TableHead>
                    <TableHead className="text-center">Response</TableHead>
                    <TableHead className="text-center">Feedback</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patternsWithHealth.map(p => {
                    const total = p.success_count + p.error_count;
                    const successRate = total > 0 ? ((p.success_count / total) * 100).toFixed(0) : "–";
                    
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div>
                            <div className="font-mono text-sm truncate max-w-[200px]">
                              {p.keywords.slice(0, 3).join(", ")}
                            </div>
                            <div className="text-xs text-muted-foreground">{p.table_name}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className={`font-bold ${getHealthColor(p.healthScore)}`}>
                            {p.healthScore}%
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Zap className="h-3 w-3 text-muted-foreground" />
                            <span>{p.usage_count}</span>
                            <span className="text-muted-foreground">({successRate}%)</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span>{p.avg_response_time_ms || 0}ms</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="flex items-center gap-1 text-green-600">
                              <ThumbsUp className="h-3 w-3" />
                              {p.helpful_count}
                            </span>
                            <span className="flex items-center gap-1 text-red-600">
                              <ThumbsDown className="h-3 w-3" />
                              {p.harmful_count}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {p.is_active ? (
                            <Badge variant="default" className="bg-green-500">Actief</Badge>
                          ) : (
                            <Badge variant="secondary">Inactief</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => togglePatternStatus.mutate({ id: p.id, activate: !p.is_active })}
                            disabled={togglePatternStatus.isPending}
                          >
                            {p.is_active ? (
                              <PauseCircle className="h-4 w-4 text-orange-500" />
                            ) : (
                              <PlayCircle className="h-4 w-4 text-green-500" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            <div className="space-y-3">
              {(optimizationLogs || []).length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Geen recente optimalisatie activiteit</p>
                </div>
              ) : (
              optimizationLogs?.map(log => (
                  <div key={log.id} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {log.priority === "high" ? (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        ) : (
                          <Activity className="h-4 w-4 text-blue-500" />
                        )}
                        <span className="font-medium text-sm">{log.title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {log.detected_at ? formatDistanceToNow(new Date(log.detected_at), { addSuffix: true, locale: nl }) : '–'}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{log.description}</p>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
