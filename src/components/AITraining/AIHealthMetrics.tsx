import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Activity, 
  Brain, 
  AlertTriangle, 
  CheckCircle, 
  Sparkles,
  ThumbsUp,
  Eye,
  Database,
  Recycle,
  TrendingUp
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
      const [
        patternsResult,
        auditResult,
        feedbackResult,
        knowledgeActiveResult,
        knowledgeDeletedResult,
        categoryResult
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
        
        // Active knowledge stats
        supabase
          .from("ai_knowledge_base")
          .select("id, usage_count, source_type")
          .is("deleted_at", null),
        
        // Soft-deleted knowledge with usage (recovery needed)
        supabase
          .from("ai_knowledge_base")
          .select("id, usage_count")
          .not("deleted_at", "is", null)
          .gt("usage_count", 0),
        
        // Category distribution
        supabase
          .from("ai_knowledge_base")
          .select("category, usage_count")
          .is("deleted_at", null)
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

      // Active knowledge stats
      const activeKnowledge = knowledgeActiveResult.data || [];
      const totalActive = activeKnowledge.length;
      const withUsage = activeKnowledge.filter(k => (k.usage_count || 0) > 0).length;
      const totalUsage = activeKnowledge.reduce((sum, k) => sum + (k.usage_count || 0), 0);
      const unknownSource = activeKnowledge.filter(k => k.source_type === 'unknown').length;
      const utilizationRate = totalActive > 0 ? Math.round((withUsage / totalActive) * 100) : 0;

      // Soft-deleted with usage (recovery needed)
      const deletedWithUsage = knowledgeDeletedResult.data || [];
      const recoveryNeeded = deletedWithUsage.length;
      const recoveryUsage = deletedWithUsage.reduce((sum, k) => sum + (k.usage_count || 0), 0);

      // Category distribution
      const categoryData = categoryResult.data || [];
      const categoryMap = new Map<string, { count: number; usage: number }>();
      categoryData.forEach(item => {
        const existing = categoryMap.get(item.category) || { count: 0, usage: 0 };
        categoryMap.set(item.category, {
          count: existing.count + 1,
          usage: existing.usage + (item.usage_count || 0)
        });
      });
      const topCategories = Array.from(categoryMap.entries())
        .sort((a, b) => b[1].usage - a[1].usage)
        .slice(0, 5)
        .map(([name, data]) => ({ name, ...data }));

      return {
        totalPatterns,
        patternsWithUsage,
        totalPatternUsage,
        patternsWithBoost,
        auditRecords: auditResult.count || 0,
        totalFeedback: feedbackResult.data?.length || 0,
        totalActive,
        withUsage,
        totalUsage,
        unknownSource,
        utilizationRate,
        recoveryNeeded,
        recoveryUsage,
        topCategories,
        patternUsageRate: totalPatterns > 0 ? Math.round((patternsWithUsage / totalPatterns) * 100) : 0
      };
    },
    staleTime: 60000,
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
      label: "Knowledge Base",
      value: `${metrics?.totalActive || 0}`,
      status: (metrics?.totalActive || 0) > 500 ? 'success' : 'warning',
      icon: <Database className="h-4 w-4" />
    },
    {
      label: "Utilization",
      value: `${metrics?.utilizationRate || 0}%`,
      status: (metrics?.utilizationRate || 0) > 70 ? 'success' : (metrics?.utilizationRate || 0) > 50 ? 'warning' : 'error',
      icon: <TrendingUp className="h-4 w-4" />
    },
    {
      label: "Active Patterns",
      value: `${metrics?.patternsWithBoost || 0}/${metrics?.totalPatterns || 0}`,
      status: (metrics?.patternsWithBoost || 0) > 0 ? 'success' : 'error',
      icon: <Brain className="h-4 w-4" />
    },
    {
      label: "Total Usage",
      value: metrics?.totalUsage?.toLocaleString() || 0,
      status: (metrics?.totalUsage || 0) > 1000 ? 'success' : 'warning',
      icon: <Activity className="h-4 w-4" />
    }
  ];

  const secondaryMetrics: HealthMetric[] = [
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
    },
    {
      label: "Pattern Usage",
      value: metrics?.totalPatternUsage || 0,
      status: (metrics?.totalPatternUsage || 0) > 0 ? 'success' : 'error',
      icon: <Sparkles className="h-4 w-4" />
    },
    {
      label: "Items w/ Usage",
      value: metrics?.withUsage || 0,
      status: (metrics?.withUsage || 0) > 400 ? 'success' : 'warning',
      icon: <CheckCircle className="h-4 w-4" />
    }
  ];

  const hasRecoveryNeeded = (metrics?.recoveryNeeded || 0) > 0;
  const hasDataQualityIssues = (metrics?.unknownSource || 0) > 0;
  
  const overallHealth = 
    (metrics?.utilizationRate || 0) >= 70 &&
    (metrics?.patternsWithBoost || 0) > 0 &&
    !hasRecoveryNeeded &&
    !hasDataQualityIssues
      ? 'healthy'
      : (metrics?.utilizationRate || 0) >= 50 
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
        {/* Recovery Alert */}
        {hasRecoveryNeeded && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
            <Recycle className="h-5 w-5 text-red-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                Data Recovery Nodig
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics?.recoveryNeeded} soft-deleted items met {metrics?.recoveryUsage} totale usage wachten op herstel.
              </p>
            </div>
          </div>
        )}

        {/* Data Quality Alert */}
        {hasDataQualityIssues && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                Data Quality Issues
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics?.unknownSource} items hebben source_type = 'unknown'
              </p>
            </div>
          </div>
        )}

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
            </div>
          ))}
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {secondaryMetrics.map((metric, idx) => (
            <div 
              key={idx}
              className="p-2 rounded-lg bg-muted/50 flex items-center gap-2"
            >
              <div className={`p-1.5 rounded ${
                metric.status === 'success' ? 'bg-green-500/20 text-green-600' :
                metric.status === 'warning' ? 'bg-amber-500/20 text-amber-600' :
                'bg-red-500/20 text-red-600'
              }`}>
                {metric.icon}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="text-sm font-semibold">{metric.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Utilization Rate Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Knowledge Utilization Rate</span>
            <span className="font-medium">{metrics?.utilizationRate || 0}%</span>
          </div>
          <Progress 
            value={metrics?.utilizationRate || 0} 
            className={`h-2 ${
              (metrics?.utilizationRate || 0) > 70 ? '[&>div]:bg-green-500' :
              (metrics?.utilizationRate || 0) > 50 ? '[&>div]:bg-amber-500' :
              '[&>div]:bg-red-500'
            }`}
          />
        </div>

        {/* Top Categories */}
        {metrics?.topCategories && metrics.topCategories.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Top Categorieën (by usage)</p>
            <div className="flex flex-wrap gap-2">
              {metrics.topCategories.map((cat, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {cat.name}: {cat.count} items ({cat.usage} usage)
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Improvement Alerts */}
        {overallHealth !== 'healthy' && !hasRecoveryNeeded && !hasDataQualityIssues && (
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
