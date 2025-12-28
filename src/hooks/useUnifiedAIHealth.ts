import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { LEARNING_FUNCTIONS } from "@/lib/constants/learningFunctions";

export interface EdgeFunctionStatus {
  name: string;
  displayName: string;
  lastRun: string | null;
  successCount: number;
  failureCount: number;
  avgDurationMs: number;
  status: 'healthy' | 'warning' | 'error' | 'idle';
}

export interface KnowledgeBaseMetrics {
  totalActive: number;
  withUsage: number;
  totalUsage: number;
  utilizationRate: number;
  unknownSource: number;
  recoveryNeeded: number;
  recoveryUsage: number;
  geminiResearchCount: number;
  topCategories: Array<{ name: string; count: number; usage: number }>;
  patternsWithBoost: number;
  totalPatterns: number;
  auditRecords: number;
  totalFeedback: number;
}

export interface UnifiedAIHealthData {
  edgeFunctions: EdgeFunctionStatus[];
  knowledgeBase: KnowledgeBaseMetrics;
  summary: {
    healthyLoops: number;
    warningLoops: number;
    errorLoops: number;
    idleLoops: number;
    overallSuccessRate: number;
    overallHealth: 'excellent' | 'good' | 'warning' | 'critical';
  };
  lastUpdated: Date;
}

async function fetchEdgeFunctionStatus(): Promise<EdgeFunctionStatus[]> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { data: functionLogs, error } = await supabase
    .from('function_call_logs')
    .select('function_name, success, execution_time_ms, created_at')
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.warn('Could not fetch function logs:', error.message);
  }

  return LEARNING_FUNCTIONS.map(fn => {
    const fnLogs = functionLogs?.filter(log => log.function_name === fn.name) || [];
    const successCount = fnLogs.filter(log => log.success === true).length;
    const failureCount = fnLogs.filter(log => log.success === false).length;
    const totalRuns = successCount + failureCount;
    const avgDuration = fnLogs.length > 0 
      ? fnLogs.reduce((sum, log) => sum + (log.execution_time_ms || 0), 0) / fnLogs.length 
      : 0;
    const lastRun = fnLogs.length > 0 ? fnLogs[0].created_at : null;

    let status: 'healthy' | 'warning' | 'error' | 'idle' = 'idle';
    if (totalRuns > 0) {
      const successRate = successCount / totalRuns;
      if (successRate >= 0.95) status = 'healthy';
      else if (successRate >= 0.8) status = 'warning';
      else status = 'error';
    }

    return {
      name: fn.name,
      displayName: fn.displayName,
      lastRun,
      successCount,
      failureCount,
      avgDurationMs: Math.round(avgDuration),
      status
    };
  });
}

async function fetchKnowledgeBaseMetrics(): Promise<KnowledgeBaseMetrics> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    totalActiveCount,
    withUsageCount,
    unknownSourceCount,
    recoveryNeededCount,
    geminiResearchCount,
    patternsResult,
    auditResult,
    feedbackResult,
    categoryResult,
    deletedWithUsageResult
  ] = await Promise.all([
    supabase.from("ai_knowledge_base").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("ai_knowledge_base").select("id", { count: "exact", head: true }).is("deleted_at", null).gt("usage_count", 0),
    supabase.from("ai_knowledge_base").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("source_type", "unknown"),
    supabase.from("ai_knowledge_base").select("id", { count: "exact", head: true }).not("deleted_at", "is", null).gt("usage_count", 0),
    supabase.from("ai_knowledge_base").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("source_type", "gemini_deep_research"),
    supabase.from("ai_knowledge_base").select("id, usage_count, confidence_score, value").eq("category", "success_patterns").is("deleted_at", null),
    supabase.from("ai_recommendation_audit").select("id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
    supabase.from("ai_learning_events").select("id", { count: "exact" }).in("event_type", ["ai_suggestion_accepted", "ai_suggestion_rejected", "feedback"]).gte("created_at", sevenDaysAgo),
    supabase.from("ai_knowledge_base").select("category, usage_count").is("deleted_at", null).order("usage_count", { ascending: false }).limit(3000),
    supabase.from("ai_knowledge_base").select("id, usage_count").not("deleted_at", "is", null).gt("usage_count", 0).limit(500)
  ]);

  const totalActive = totalActiveCount.count || 0;
  const withUsage = withUsageCount.count || 0;
  const utilizationRate = totalActive > 0 ? Math.round((withUsage / totalActive) * 100) : 0;

  const patterns = patternsResult.data || [];
  const patternsWithBoost = patterns.filter(p => {
    const value = p.value as Record<string, unknown>;
    return value?.boost_factor && (value.boost_factor as number) > 0;
  }).length;

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

  const deletedWithUsage = deletedWithUsageResult.data || [];
  const recoveryUsage = deletedWithUsage.reduce((sum, k) => sum + (k.usage_count || 0), 0);
  
  // Estimate total usage
  const sampleUsage = categoryData.reduce((sum, k) => sum + (k.usage_count || 0), 0);
  const totalUsage = categoryData.length >= 3000 && totalActive > 3000
    ? Math.round(sampleUsage * (totalActive / categoryData.length))
    : sampleUsage;

  return {
    totalActive,
    withUsage,
    totalUsage,
    utilizationRate,
    unknownSource: unknownSourceCount.count || 0,
    recoveryNeeded: recoveryNeededCount.count || 0,
    recoveryUsage,
    geminiResearchCount: geminiResearchCount.count || 0,
    topCategories,
    patternsWithBoost,
    totalPatterns: patterns.length,
    auditRecords: auditResult.count || 0,
    totalFeedback: feedbackResult.data?.length || 0
  };
}

export function useUnifiedAIHealth() {
  const query = useQuery({
    queryKey: ['unified-ai-health'],
    queryFn: async (): Promise<UnifiedAIHealthData> => {
      const [edgeFunctions, knowledgeBase] = await Promise.all([
        fetchEdgeFunctionStatus(),
        fetchKnowledgeBaseMetrics()
      ]);

      const healthyLoops = edgeFunctions.filter(l => l.status === 'healthy').length;
      const warningLoops = edgeFunctions.filter(l => l.status === 'warning').length;
      const errorLoops = edgeFunctions.filter(l => l.status === 'error').length;
      const idleLoops = edgeFunctions.filter(l => l.status === 'idle').length;

      const totalSuccess = edgeFunctions.reduce((sum, l) => sum + l.successCount, 0);
      const totalFailure = edgeFunctions.reduce((sum, l) => sum + l.failureCount, 0);
      const overallSuccessRate = totalSuccess + totalFailure > 0 
        ? Math.round((totalSuccess / (totalSuccess + totalFailure)) * 100) 
        : 0;

      // Calculate overall health
      const hasRecoveryNeeded = knowledgeBase.recoveryNeeded > 0;
      const hasDataQualityIssues = knowledgeBase.unknownSource > 0;
      
      let overallHealth: 'excellent' | 'good' | 'warning' | 'critical' = 'excellent';
      if (errorLoops > 0 || hasRecoveryNeeded) {
        overallHealth = 'critical';
      } else if (warningLoops > 0 || hasDataQualityIssues || knowledgeBase.utilizationRate < 50) {
        overallHealth = 'warning';
      } else if (knowledgeBase.utilizationRate >= 70 && overallSuccessRate >= 95) {
        overallHealth = 'excellent';
      } else {
        overallHealth = 'good';
      }

      return {
        edgeFunctions,
        knowledgeBase,
        summary: {
          healthyLoops,
          warningLoops,
          errorLoops,
          idleLoops,
          overallSuccessRate,
          overallHealth
        },
        lastUpdated: new Date()
      };
    },
    staleTime: 30000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  // Real-time subscription for function_call_logs
  useEffect(() => {
    const channel = supabase
      .channel('unified-health-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'function_call_logs'
        },
        () => {
          query.refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [query]);

  return query;
}
