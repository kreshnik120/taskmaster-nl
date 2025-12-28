import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { 
  Brain, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Activity,
  Zap,
  Database,
  GitBranch,
  MessageSquare
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

interface LearningLoopStatus {
  name: string;
  displayName: string;
  icon: React.ReactNode;
  lastRun: string | null;
  successCount: number;
  failureCount: number;
  avgDurationMs: number;
  status: 'healthy' | 'warning' | 'error' | 'idle';
}

export function AILearningStatusWidget() {
  const [loops, setLoops] = useState<LearningLoopStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchLearningStatus = async () => {
    try {
      // Fetch function call logs for the last 24 hours
      // Using RPC or direct query - the table may have service-role-only access
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: functionLogs, error: logsError } = await supabase
        .from('function_call_logs')
        .select('function_name, success, execution_time_ms, created_at')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(1000);

      // Don't throw on error - table might not be accessible to anon users
      if (logsError) {
        console.warn('Could not fetch function logs (may require auth):', logsError.message);
      }

      // Define the learning loops we want to track
      const learningFunctions = [
        { name: 'unified-learner', displayName: 'Unified Learner', icon: <Brain className="h-4 w-4" /> },
        { name: 'feedback-processor', displayName: 'Feedback Processor', icon: <MessageSquare className="h-4 w-4" /> },
        { name: 'knowledge-graph-builder', displayName: 'Knowledge Graph', icon: <GitBranch className="h-4 w-4" /> },
        { name: 'apply-meta-patterns', displayName: 'Meta Patterns', icon: <Zap className="h-4 w-4" /> },
        { name: 'temporal-decay', displayName: 'Temporal Decay', icon: <Clock className="h-4 w-4" /> },
        { name: 'data-quality-auditor', displayName: 'Data Quality', icon: <Database className="h-4 w-4" /> },
        { name: 'smart-deduplicator', displayName: 'Deduplicator', icon: <Activity className="h-4 w-4" /> },
        { name: 'process-system-events', displayName: 'System Events', icon: <RefreshCw className="h-4 w-4" /> },
      ];

      // Process logs into status objects
      const loopStatuses: LearningLoopStatus[] = learningFunctions.map(fn => {
        const fnLogs = functionLogs?.filter(log => log.function_name === fn.name) || [];
        const successCount = fnLogs.filter(log => log.success === true).length;
        const failureCount = fnLogs.filter(log => log.success === false).length;
        const totalRuns = successCount + failureCount;
        const avgDuration = fnLogs.length > 0 
          ? fnLogs.reduce((sum, log) => sum + (log.execution_time_ms || 0), 0) / fnLogs.length 
          : 0;
        const lastRun = fnLogs.length > 0 ? fnLogs[0].created_at : null;

        // Determine status
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
          icon: fn.icon,
          lastRun,
          successCount,
          failureCount,
          avgDurationMs: Math.round(avgDuration),
          status
        };
      });

      setLoops(loopStatuses);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching learning status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLearningStatus();
    
    // Set up real-time subscription
    const channel = supabase
      .channel('learning-status-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'function_call_logs'
        },
        () => {
          fetchLearningStatus();
        }
      )
      .subscribe();

    // Also poll every 30 seconds as backup
    const interval = setInterval(fetchLearningStatus, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'warning': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'error': return 'bg-red-500/10 text-red-600 border-red-500/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
      case 'warning': return <Activity className="h-3.5 w-3.5 text-amber-500" />;
      case 'error': return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const totalSuccess = loops.reduce((sum, l) => sum + l.successCount, 0);
  const totalFailure = loops.reduce((sum, l) => sum + l.failureCount, 0);
  const overallSuccessRate = totalSuccess + totalFailure > 0 
    ? Math.round((totalSuccess / (totalSuccess + totalFailure)) * 100) 
    : 0;

  const healthyCount = loops.filter(l => l.status === 'healthy').length;
  const warningCount = loops.filter(l => l.status === 'warning').length;
  const errorCount = loops.filter(l => l.status === 'error').length;

  if (isLoading) {
    return (
      <Card className="col-span-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-primary" />
            AI Learning Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-primary" />
            AI Learning Status
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </div>
            <span className="text-xs text-muted-foreground">
              Bijgewerkt {formatDistanceToNow(lastUpdated, { addSuffix: true, locale: nl })}
            </span>
          </div>
        </div>
        
        {/* Summary stats */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-medium">{healthyCount} gezond</span>
          </div>
          {warningCount > 0 && (
            <div className="flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">{warningCount} waarschuwing</span>
            </div>
          )}
          {errorCount > 0 && (
            <div className="flex items-center gap-1.5">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium">{errorCount} fout</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">24h succes:</span>
            <Badge variant="outline" className={overallSuccessRate >= 95 ? 'border-emerald-500/50 text-emerald-600' : 'border-amber-500/50 text-amber-600'}>
              {overallSuccessRate}%
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {loops.map((loop) => {
            const successRate = loop.successCount + loop.failureCount > 0
              ? Math.round((loop.successCount / (loop.successCount + loop.failureCount)) * 100)
              : null;

            return (
              <div
                key={loop.name}
                className={`p-3 rounded-lg border ${getStatusColor(loop.status)} transition-all hover:shadow-sm`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-background/50">
                      {loop.icon}
                    </div>
                    <span className="text-sm font-medium">{loop.displayName}</span>
                  </div>
                  {getStatusIcon(loop.status)}
                </div>
                
                <div className="space-y-1.5">
                  {loop.lastRun ? (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Laatste run:</span>
                      <span className="font-medium">
                        {formatDistanceToNow(new Date(loop.lastRun), { addSuffix: true, locale: nl })}
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Nog niet gedraaid</div>
                  )}
                  
                  {successRate !== null && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Succes rate:</span>
                      <span className="font-medium">{successRate}%</span>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Runs (24h):</span>
                    <span className="font-medium">
                      {loop.successCount + loop.failureCount}
                      {loop.failureCount > 0 && (
                        <span className="text-red-500 ml-1">({loop.failureCount} ✗)</span>
                      )}
                    </span>
                  </div>
                  
                  {loop.avgDurationMs > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Gem. duur:</span>
                      <span className="font-medium">
                        {loop.avgDurationMs > 1000 
                          ? `${(loop.avgDurationMs / 1000).toFixed(1)}s`
                          : `${loop.avgDurationMs}ms`
                        }
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
