import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Database, TrendingUp, Shield, Zap, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { logger } from "@/lib/logger";

interface HealthMetric {
  label: string;
  value: number | string;
  status: 'good' | 'warning' | 'error';
  icon: React.ReactNode;
}

export const SystemMonitor = () => {
  const [knowledgeStats, setKnowledgeStats] = useState({ total: 0, today: 0, confidence: 0 });
  const [cacheStats, setCacheStats] = useState({ active: 0, hitRate: 0 });
  const [edgeFunctionStats, setEdgeFunctionStats] = useState({ success: 0, total: 0 });
  const [patternStats, setPatternStats] = useState({ active: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      // Knowledge stats
      const { count: totalCount } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: todayCount } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo)
        .is('deleted_at', null);

      const { data: confidenceData } = await supabase
        .from('ai_knowledge_base')
        .select('confidence_score')
        .is('deleted_at', null)
        .not('confidence_score', 'is', null);

      const avgConfidence = confidenceData?.length 
        ? confidenceData.reduce((sum, k) => sum + (k.confidence_score || 0), 0) / confidenceData.length 
        : 0;

      setKnowledgeStats({
        total: totalCount || 0,
        today: todayCount || 0,
        confidence: Math.round(avgConfidence * 100),
      });

      // Cache stats
      const now = new Date().toISOString();
      const { data: cacheData } = await supabase
        .from('ai_response_cache')
        .select('hit_count, expires_at')
        .gte('expires_at', now);

      const activeCache = cacheData?.length || 0;
      const totalHits = cacheData?.reduce((sum, c) => sum + c.hit_count, 0) || 0;
      const avgHitRate = activeCache > 0 ? totalHits / activeCache : 0;

      setCacheStats({
        active: activeCache,
        hitRate: Math.round(avgHitRate * 10) / 10,
      });

      // Edge function stats (last 24h)
      const { data: edgeData } = await supabase
        .from('function_call_logs')
        .select('function_name, success, metadata')
        .gte('created_at', oneDayAgo);

      const totalCalls = edgeData?.length || 0;
      const successCalls = edgeData?.filter(e => e.success === true).length || 0;

      setEdgeFunctionStats({
        success: successCalls,
        total: totalCalls,
      });

      // Fast path pattern stats
      const { count: totalPatterns } = await supabase
        .from('fast_path_patterns')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);

      const { count: activePatterns } = await supabase
        .from('fast_path_patterns')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('is_active', true);

      setPatternStats({
        active: activePatterns || 0,
        total: totalPatterns || 0,
      });

    } catch (error) {
      logger.error('Error loading monitoring data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const successRate = edgeFunctionStats.total > 0 
    ? Math.round((edgeFunctionStats.success / edgeFunctionStats.total) * 100) 
    : 100;

  const patternEfficiency = patternStats.total > 0
    ? Math.round((patternStats.active / patternStats.total) * 100)
    : 0;

  const metrics: HealthMetric[] = [
    {
      label: 'Knowledge Base',
      value: knowledgeStats.total.toLocaleString(),
      status: knowledgeStats.total > 1000 ? 'good' : knowledgeStats.total > 100 ? 'warning' : 'error',
      icon: <Database className="h-4 w-4" />,
    },
    {
      label: 'Confidence',
      value: `${knowledgeStats.confidence}%`,
      status: knowledgeStats.confidence >= 90 ? 'good' : knowledgeStats.confidence >= 70 ? 'warning' : 'error',
      icon: <Shield className="h-4 w-4" />,
    },
    {
      label: 'Edge Functions',
      value: `${successRate}%`,
      status: successRate >= 95 ? 'good' : successRate >= 80 ? 'warning' : 'error',
      icon: <Zap className="h-4 w-4" />,
    },
    {
      label: 'Cache Hit Rate',
      value: cacheStats.hitRate.toFixed(1),
      status: cacheStats.active > 0 ? 'good' : 'warning',
      icon: <Activity className="h-4 w-4" />,
    },
  ];

  const getStatusColor = (status: 'good' | 'warning' | 'error') => {
    switch (status) {
      case 'good': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'error': return 'text-red-500';
    }
  };

  const getStatusBadge = (status: 'good' | 'warning' | 'error') => {
    switch (status) {
      case 'good': return <Badge variant="default" className="bg-green-500/10 text-green-500 border-green-500/20">Healthy</Badge>;
      case 'warning': return <Badge variant="outline" className="border-yellow-500/50 text-yellow-500">Warning</Badge>;
      case 'error': return <Badge variant="destructive">Critical</Badge>;
    }
  };

  const overallHealth = metrics.every(m => m.status === 'good') ? 'good' 
    : metrics.some(m => m.status === 'error') ? 'error' 
    : 'warning';

  return (
    <div className="space-y-6">
      {/* Health Score Header */}
      <Card className="border-2" style={{ borderColor: overallHealth === 'good' ? 'hsl(var(--success))' : overallHealth === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--warning))' }}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {overallHealth === 'good' ? (
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              ) : overallHealth === 'error' ? (
                <AlertTriangle className="h-8 w-8 text-red-500" />
              ) : (
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
              )}
              <div>
                <CardTitle className="text-xl">Enterprise Health Status</CardTitle>
                <CardDescription>Real-time system monitoring</CardDescription>
              </div>
            </div>
            {getStatusBadge(overallHealth)}
          </div>
        </CardHeader>
      </Card>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className={getStatusColor(metric.status)}>{metric.icon}</span>
                {metric.status === 'good' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : metric.status === 'warning' ? (
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                )}
              </div>
              <div className="text-2xl font-bold">{metric.value}</div>
              <p className="text-xs text-muted-foreground">{metric.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vandaag Geleerd</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{knowledgeStats.today}</div>
            <p className="text-xs text-muted-foreground">nieuwe items laatste 24u</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fast Path Patterns</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{patternStats.active}/{patternStats.total}</div>
            <p className="text-xs text-muted-foreground">{patternEfficiency}% efficiëntie</p>
          </CardContent>
        </Card>
      </div>

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
          <CardDescription>Autonomous AI system operating parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Operating Mode:</span>
            <Badge variant="default">Autonomous Learning</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Safety Level:</span>
            <Badge variant="outline">High (Human-in-the-Loop)</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Learning Frequency:</span>
            <span className="font-medium">Continuous (14 scheduled jobs)</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Cache Status:</span>
            <span className="font-medium">{cacheStats.active} active entries</span>
          </div>
          <div className="border-t pt-3 mt-3">
            <p className="text-xs text-muted-foreground">
              <strong>Costs:</strong> Approximately €0.15-0.30 per day (~€5-9/month) for continuous learning.
              Most economical AI system with real-time knowledge updates.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
