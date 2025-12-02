import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Activity, 
  Brain, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Eye
} from "lucide-react";

interface HealthMetric {
  label: string;
  value: number | string;
  target?: number;
  status: 'success' | 'warning' | 'error';
  icon: React.ReactNode;
}

export function AIHealthMetrics() {
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ["ai-health-metrics"],
    queryFn: async () => {
      // Fetch all metrics in parallel
      const [
        patternsResult,
        auditResult,
        feedbackResult,
        knowledgeResult
      ] = await Promise.all([
        // Success patterns with usage
        supabase
          .from("ai_knowledge_base")
          .select("id, usage_count, confidence_score, value")
          .eq("category", "success_patterns")
          .is("deleted_at", null),
        
        // Audit trail records (last 7 days)
        supabase
          .from("ai_recommendation_audit")
          .select("id, created_at", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        
        // Feedback events (last 7 days)
        supabase
          .from("ai_learning_events")
          .select("id, event_type", { count: "exact" })
          .in("event_type", ["ai_suggestion_accepted", "ai_suggestion_rejected", "feedback"])
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        
        // Knowledge utilization
        supabase
          .from("ai_knowledge_base")
          .select("id, usage_count")
          .is("deleted_at", null)
          .gt("usage_count", 0)
      ]);

      // Calculate pattern metrics
      const patterns = patternsResult.data || [];
      const totalPatterns = patterns.length;
      const patternsWithUsage = patterns.filter(p => (p.usage_count || 0) > 0).length;
      const totalPatternUsage = patterns.reduce((sum, p) => sum + (p.usage_count || 0), 0);
      const patternsWithBoost = patterns.filter(p => {
        const value = p.value as Record<string, unknown>;
        return value?.boost_factor && (value.boost_factor as number) > 0;
      }).length;

      // Audit metrics
      const auditRecords = auditResult.count || 0;

      // Feedback metrics
      const feedbackEvents = feedbackResult.data || [];
      const totalFeedback = feedbackEvents.length;
      const positiveFeedback = feedbackEvents.filter(e => 
        e.event_type === "ai_suggestion_accepted" || e.event_type === "feedback"
      ).length;

      // Knowledge utilization
      const usedKnowledge = knowledgeResult.data?.length || 0;

      return {
        totalPatterns,
        patternsWithUsage,
        totalPatternUsage,
        patternsWithBoost,
        auditRecords,
        totalFeedback,
        positiveFeedback,
        usedKnowledge,
        patternUsageRate: totalPatterns > 0 ? Math.round((patternsWithUsage / totalPatterns) * 100) : 0
      };
    },
    staleTime: 60000, // 1 minute
    refetchInterval: 60000
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-4">
          <p className="text-destructive">Fout bij laden van AI metrics</p>
        </CardContent>
      </Card>
    );
  }

  const healthMetrics: HealthMetric[] = [
    {
      label: "Active Patterns",
      value: `${metrics?.patternsWithBoost || 0}/${metrics?.totalPatterns || 0}`,
      status: (metrics?.patternsWithBoost || 0) > 0 ? 'success' : 'error',
      icon: <Brain className="h-4 w-4" />
    },
    {
      label: "Pattern Usage",
      value: metrics?.totalPatternUsage || 0,
      target: 10,
      status: (metrics?.totalPatternUsage || 0) > 0 ? 'success' : 'error',
      icon: <Activity className="h-4 w-4" />
    },
    {
      label: "Audit Trail (7d)",
      value: metrics?.auditRecords || 0,
      status: (metrics?.auditRecords || 0) > 0 ? 'success' : 'warning',
      icon: <Eye className="h-4 w-4" />
    },
    {
      label: "Feedback Events",
      value: metrics?.totalFeedback || 0,
      status: (metrics?.totalFeedback || 0) > 0 ? 'success' : 'warning',
      icon: <ThumbsUp className="h-4 w-4" />
    }
  ];

  const overallHealth = 
    (metrics?.patternsWithBoost || 0) > 0 &&
    (metrics?.auditRecords || 0) > 0 &&
    (metrics?.totalPatternUsage || 0) > 0
      ? 'healthy'
      : (metrics?.patternsWithBoost || 0) > 0 
        ? 'partial'
        : 'critical';

  return (
    <Card className={
      overallHealth === 'healthy' ? 'border-green-500/30 bg-green-500/5' :
      overallHealth === 'partial' ? 'border-amber-500/30 bg-amber-500/5' :
      'border-red-500/30 bg-red-500/5'
    }>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI Learning Health</CardTitle>
          </div>
          <Badge 
            variant={overallHealth === 'healthy' ? 'default' : overallHealth === 'partial' ? 'secondary' : 'destructive'}
            className="gap-1"
          >
            {overallHealth === 'healthy' && <CheckCircle className="h-3 w-3" />}
            {overallHealth === 'partial' && <AlertTriangle className="h-3 w-3" />}
            {overallHealth === 'critical' && <AlertTriangle className="h-3 w-3" />}
            {overallHealth === 'healthy' ? 'Gezond' : overallHealth === 'partial' ? 'Gedeeltelijk' : 'Aandacht Nodig'}
          </Badge>
        </div>
        <CardDescription>
          Real-time status van het AI learning systeem
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Main Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {healthMetrics.map((metric, idx) => (
            <div 
              key={idx}
              className={`p-3 rounded-lg border ${
                metric.status === 'success' ? 'bg-green-500/10 border-green-500/20' :
                metric.status === 'warning' ? 'bg-amber-500/10 border-amber-500/20' :
                'bg-red-500/10 border-red-500/20'
              }`}
            >
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                {metric.icon}
                <span className="text-xs">{metric.label}</span>
              </div>
              <div className="text-xl font-bold">
                {metric.value}
              </div>
              {metric.status === 'error' && (
                <p className="text-xs text-red-500 mt-1">⚠️ Niet actief</p>
              )}
            </div>
          ))}
        </div>

        {/* Pattern Usage Rate */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Pattern Usage Rate</span>
            <span className="font-medium">{metrics?.patternUsageRate || 0}%</span>
          </div>
          <Progress 
            value={metrics?.patternUsageRate || 0} 
            className={`h-2 ${
              (metrics?.patternUsageRate || 0) > 50 ? '[&>div]:bg-green-500' :
              (metrics?.patternUsageRate || 0) > 20 ? '[&>div]:bg-amber-500' :
              '[&>div]:bg-red-500'
            }`}
          />
        </div>

        {/* Alerts */}
        {overallHealth !== 'healthy' && (
          <div className="p-3 rounded-lg bg-muted/50 space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Verbeterpunten:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1">
              {(metrics?.totalPatternUsage || 0) === 0 && (
                <li>• Patterns worden niet gebruikt - open ApplicationDetailModal met matches</li>
              )}
              {(metrics?.auditRecords || 0) === 0 && (
                <li>• Geen audit trail - check browser console voor AIRecommendationBadge errors</li>
              )}
              {(metrics?.totalFeedback || 0) === 0 && (
                <li>• Geen feedback ontvangen - test de 👍/👎 buttons bij client matches</li>
              )}
            </ul>
          </div>
        )}

        {/* Debug Info */}
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Debug Info
          </summary>
          <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
            {JSON.stringify(metrics, null, 2)}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}
