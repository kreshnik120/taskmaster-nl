import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, Zap, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useState } from "react";

export function SystemHealthDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isStartingBackfill, setIsStartingBackfill] = useState(false);

  // Fetch orchestrator state
  const { data: orchestratorState, refetch: refetchOrchestrator } = useQuery({
    queryKey: ['orchestrator-state'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orchestrator_state')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  // Fetch embedding coverage
  const { data: embeddingStats } = useQuery({
    queryKey: ['embedding-stats'],
    queryFn: async () => {
      const { count: knowledgeCount, error: kError } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);
      
      const { count: embeddingCount, error: eError } = await supabase
        .from('knowledge_embeddings')
        .select('*', { count: 'exact', head: true });
      
      if (kError || eError) throw kError || eError;
      
      return {
        total: knowledgeCount || 0,
        withEmbeddings: embeddingCount || 0,
        missing: (knowledgeCount || 0) - (embeddingCount || 0),
        coverage: knowledgeCount ? ((embeddingCount || 0) / knowledgeCount * 100) : 0
      };
    },
    refetchInterval: 30000,
  });

  // Fetch recent health logs
  const { data: healthLogs } = useQuery({
    queryKey: ['health-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_health_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  // Trigger manual backfill - intelligently resume or start new
  const triggerBackfill = async () => {
    setIsStartingBackfill(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        throw new Error('Niet geauthenticeerd');
      }

      // Check if there's an existing paused or running run
      const shouldResumeExisting = 
        orchestratorState?.status === 'paused' || 
        orchestratorState?.status === 'running';

      const actionDescription = shouldResumeExisting 
        ? 'Bestaande run wordt hervat...' 
        : 'Nieuwe run wordt gestart...';

      toast({
        title: actionDescription,
        description: `Verwerkt ${embeddingStats?.missing || 0} ontbrekende embeddings`,
      });

      const { data, error } = await supabase.functions.invoke('auto-backfill-orchestrator', {
        body: { 
          force_restart: !shouldResumeExisting, // Only force restart if no existing run
          batch_size: 50 
        },
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`
        }
      });

      if (error) throw error;

      toast({
        title: shouldResumeExisting ? "Run hervat!" : "Backfill gestart!",
        description: `De embedding backfill verwerkt nu ${embeddingStats?.missing || 0} items.`,
      });

      // Refresh all queries
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['orchestrator-state'] });
        queryClient.invalidateQueries({ queryKey: ['embedding-stats'] });
      }, 2000);
      
    } catch (error: any) {
      console.error('Backfill start error:', error);
      toast({
        title: "Fout bij starten backfill",
        description: error.message || 'Er is iets misgegaan',
        variant: "destructive",
      });
    } finally {
      setIsStartingBackfill(false);
    }
  };

  // Trigger manual health check
  const triggerHealthCheck = async () => {
    try {
      const { error } = await supabase.functions.invoke('system-health-monitor');
      
      if (error) throw error;
      
      toast({
        title: "Health check gestart",
        description: "Systeem wordt gecontroleerd en hersteld indien nodig",
      });
      
      setTimeout(() => {
        refetchOrchestrator();
      }, 2000);
      
    } catch (error) {
      toast({
        title: "Health check gefaald",
        description: error instanceof Error ? error.message : "Onbekende fout",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-blue-500';
      case 'idle': return 'bg-green-500';
      case 'paused': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getHealthStatus = () => {
    if (!orchestratorState || !embeddingStats) return 'unknown';
    
    const metadata = orchestratorState.metadata as any;
    const isRunning = orchestratorState.status === 'running';
    const hasStaleHeartbeat = metadata?.last_heartbeat 
      ? (Date.now() - new Date(metadata.last_heartbeat).getTime()) > 300000
      : false;
    const lowCoverage = embeddingStats.coverage < 80;
    
    if (hasStaleHeartbeat || (lowCoverage && embeddingStats.missing > 100)) {
      return 'critical';
    }
    if (isRunning || lowCoverage) {
      return 'warning';
    }
    return 'healthy';
  };

  const healthStatus = getHealthStatus();

  return (
    <div className="space-y-4">
      {/* Low Coverage Alert */}
      {embeddingStats && embeddingStats.coverage < 95 && (
        <Card className="border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-orange-900 dark:text-orange-100 text-base flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Lage Embedding Coverage Gedetecteerd
                </CardTitle>
                <CardDescription className="text-orange-700 dark:text-orange-300 mt-2">
                  {embeddingStats.missing} items hebben nog geen embeddings. 
                  Dit beperkt AI Chat, Knowledge Graph en Smart Deduplicator functionaliteit.
                  Start de backfill om het systeem volledig functioneel te maken.
                </CardDescription>
              </div>
              <Button
                onClick={triggerBackfill}
                disabled={isStartingBackfill}
                size="sm"
                className="shrink-0 ml-4"
              >
                <Play className="w-4 h-4 mr-2" />
                {isStartingBackfill ? 'Starten...' : 'Start Backfill'}
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Overall Health Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                System Health
              </CardTitle>
              <CardDescription>Real-time monitoring van AI systeem</CardDescription>
            </div>
            <Button onClick={triggerHealthCheck} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Check Health
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {healthStatus === 'healthy' && (
              <>
                <CheckCircle2 className="w-8 h-8 text-green-500" />
                <div>
                  <p className="font-medium text-green-500">Systeem is gezond</p>
                  <p className="text-sm text-muted-foreground">Alle systemen operationeel</p>
                </div>
              </>
            )}
            {healthStatus === 'warning' && (
              <>
                <AlertTriangle className="w-8 h-8 text-yellow-500" />
                <div>
                  <p className="font-medium text-yellow-500">Let op: Kleine problemen</p>
                  <p className="text-sm text-muted-foreground">Systeem herstelt automatisch</p>
                </div>
              </>
            )}
            {healthStatus === 'critical' && (
              <>
                <AlertTriangle className="w-8 h-8 text-red-500" />
                <div>
                  <p className="font-medium text-red-500">Kritiek: Interventie vereist</p>
                  <p className="text-sm text-muted-foreground">Auto-recovery actief</p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Auto-Backfill Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Auto-Backfill Orchestrator</CardTitle>
        </CardHeader>
        <CardContent>
          {orchestratorState ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge className={getStatusColor(orchestratorState.status)}>
                  {orchestratorState.status}
                </Badge>
              </div>
              {(orchestratorState.metadata as any)?.last_heartbeat && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Laatste heartbeat</span>
                  <span className="text-sm">
                    {format(new Date((orchestratorState.metadata as any).last_heartbeat), 'HH:mm:ss')}
                  </span>
                </div>
              )}
              {(orchestratorState.metadata as any)?.checkpoint_processed && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Verwerkt</span>
                  <span className="text-sm">{(orchestratorState.metadata as any).checkpoint_processed} items</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Geen actieve run</p>
          )}
        </CardContent>
      </Card>

      {/* Embedding Coverage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Embedding Coverage</CardTitle>
        </CardHeader>
        <CardContent>
          {embeddingStats ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{embeddingStats.coverage.toFixed(1)}%</span>
                <Zap className="w-5 h-5 text-yellow-500" />
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Totaal kennis items</span>
                  <span className="font-medium">{embeddingStats.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Met embeddings</span>
                  <span className="font-medium text-green-600">{embeddingStats.withEmbeddings}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ontbrekend</span>
                  <span className={`font-medium ${embeddingStats.missing > 100 ? 'text-red-600' : 'text-yellow-600'}`}>
                    {embeddingStats.missing}
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-yellow-500 to-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${embeddingStats.coverage}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Laden...</p>
          )}
        </CardContent>
      </Card>

      {/* Recent Recovery Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recente Recovery Acties</CardTitle>
        </CardHeader>
        <CardContent>
          {healthLogs && healthLogs.length > 0 ? (
            <div className="space-y-2">
              {healthLogs.map((log) => (
                <div key={log.id} className="text-sm border-l-2 border-blue-500 pl-3 py-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{log.check_type}</span>
                    <Badge variant={log.status === 'healthy' ? 'default' : 'secondary'}>
                      {log.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(log.created_at), 'dd MMM HH:mm:ss')}
                  </p>
                  {log.actions_taken && Array.isArray(log.actions_taken) && log.actions_taken.length > 0 && (
                    <ul className="mt-1 text-xs text-green-600 space-y-0.5">
                      {log.actions_taken.map((action: string, i: number) => (
                        <li key={i}>✓ {action}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Geen recente acties</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}