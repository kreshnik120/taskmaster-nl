import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, Zap, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useState } from "react";

export function SystemHealthDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isStartingBackfill, setIsStartingBackfill] = useState(false);
  const [isTogglingAutomation, setIsTogglingAutomation] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isUpdatingCategories, setIsUpdatingCategories] = useState(false);
  const [bulkValidating, setBulkValidating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

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
    refetchIntervalInBackground: false,
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
    refetchIntervalInBackground: false,
  });

  // Fetch system config (automation status & budget)
  const { data: systemConfig } = useQuery({
    queryKey: ['system-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_config')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  // Fetch daily AI spend
  const { data: dailySpend } = useQuery({
    queryKey: ['daily-ai-spend'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('function_call_logs')
        .select('estimated_cost_eur')
        .gte('created_at', today + 'T00:00:00Z')
        .lte('created_at', today + 'T23:59:59Z');
      
      if (error) throw error;
      
      const total = data?.reduce((sum, log) => {
        const cost = log.estimated_cost_eur ? parseFloat(String(log.estimated_cost_eur)) : 0;
        return sum + cost;
      }, 0) || 0;
      return { total, date: today };
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  // Trigger manual backfill - intelligently resume or start new
  const triggerBackfill = async () => {
    setIsStartingBackfill(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        throw new Error('Niet geauthenticeerd');
      }

      // Check current status
      if (orchestratorState?.status === 'running') {
        toast({
          title: "Backfill is al actief",
          description: `Er draait al een backfill.`,
        });
        // Refresh queries to show latest progress
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['orchestrator-state'] });
        }, 1000);
        return; // Exit early - don't call the function
      }

      const shouldResumeExisting = orchestratorState?.status === 'paused';
      const actionDescription = shouldResumeExisting 
        ? 'Bestaande run wordt hervat...' 
        : 'Nieuwe run wordt gestart...';

      toast({
        title: actionDescription,
        description: `Backfill wordt verwerkt`,
      });

      const { data, error } = await supabase.functions.invoke('auto-backfill-orchestrator', {
        body: { 
          force_restart: !shouldResumeExisting,
          batch_size: 50 
        },
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`
        }
      });

      if (error) throw error;

      toast({
        title: shouldResumeExisting ? "Run hervat!" : "Backfill gestart!",
        description: `De embedding backfill is actief.`,
      });

      // Refresh all queries
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['orchestrator-state'] });
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

  // Stop/Pause backfill
  const stopBackfill = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        throw new Error('Niet geauthenticeerd');
      }

      toast({
        title: "Backfill wordt gestopt...",
        description: "De lopende run wordt gepauzeerd",
      });

      const { data, error } = await supabase.functions.invoke('orchestrator-control', {
        body: { action: 'pause' },
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`
        }
      });

      if (error) throw error;

      toast({
        title: "Backfill gepauzeerd",
        description: "De run is gestopt en kan later hervat worden",
      });

      // Refresh queries
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['orchestrator-state'] });
      }, 1000);
      
    } catch (error: any) {
      console.error('Stop backfill error:', error);
      toast({
        title: "Fout bij stoppen",
        description: error.message || 'Er is iets misgegaan',
        variant: "destructive",
      });
    }
  };

  // Force restart backfill
  const forceRestartBackfill = async () => {
    setIsStartingBackfill(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        throw new Error('Niet geauthenticeerd');
      }

      toast({
        title: "Force restart...",
        description: "Bestaande run wordt gereset en opnieuw gestart",
      });

      const { data, error } = await supabase.functions.invoke('auto-backfill-orchestrator', {
        body: { 
          force_restart: true,
          batch_size: 50 
        },
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`
        }
      });

      if (error) throw error;

      toast({
        title: "Backfill herstart!",
        description: "Nieuwe run is gestart vanaf het begin",
      });

      // Refresh all queries
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['orchestrator-state'] });
      }, 2000);
      
    } catch (error: any) {
      console.error('Force restart error:', error);
      toast({
        title: "Fout bij force restart",
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

  // Toggle automation pause/resume
  const toggleAutomation = async () => {
    setIsTogglingAutomation(true);
    try {
      const newPausedState = !systemConfig?.automation_paused;
      
      const { error } = await supabase
        .from('system_config')
        .update({ automation_paused: newPausedState })
        .eq('id', systemConfig?.id);
      
      if (error) throw error;
      
      toast({
        title: newPausedState ? "⏸️ Automaties gepauzeerd" : "▶️ Automaties hervat",
        description: newPausedState 
          ? "Alle automatische processen zijn gestopt" 
          : "Automatische processen zijn weer actief",
      });
      
      queryClient.invalidateQueries({ queryKey: ['system-config'] });
      
    } catch (error: any) {
      toast({
        title: "Fout bij toggle",
        description: error.message || 'Er is iets misgegaan',
        variant: "destructive",
      });
    } finally {
      setIsTogglingAutomation(false);
    }
  };

  // Trigger auto-validation
  const triggerAutoValidate = async () => {
    setIsValidating(true);
    try {
      toast({
        title: "Auto-Validatie Gestart",
        description: "Verwerken van high-confidence items..."
      });

      const { data, error } = await supabase.functions.invoke('auto-validate-trusted-knowledge');

      if (error) throw error;

      toast({
        title: "Auto-Validatie Voltooid",
        description: `${data?.validated || 0} items geverifieerd`,
      });

      queryClient.invalidateQueries({ queryKey: ['validation-stats'] });
    } catch (error: any) {
      console.error('Error triggering auto-validate:', error);
      toast({
        title: "Error",
        description: error.message || "Kon auto-validatie niet starten",
        variant: "destructive"
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Trigger meta-orchestrator for categories update
  const triggerMetaOrchestrator = async () => {
    setIsUpdatingCategories(true);
    try {
      toast({
        title: "Categorieën Update Gestart",
        description: "Verwerken van knowledge items..."
      });

      const { data, error } = await supabase.functions.invoke('meta-orchestrator', {
        body: { 
          trigger: 'manual', 
          org_id: '550e8400-e29b-41d4-a716-446655440000',
          batch_size: 500 
        }
      });

      if (error) throw error;

      toast({
        title: "Categorieën Update Voltooid",
        description: `${data?.categories_created || 0} categorieën bijgewerkt`,
      });

      queryClient.invalidateQueries({ queryKey: ['ai-knowledge-stats'] });
    } catch (error: any) {
      console.error('Error triggering meta-orchestrator:', error);
      toast({
        title: "Error",
        description: error.message || "Kon categorieën update niet starten",
        variant: "destructive"
      });
    } finally {
      setIsUpdatingCategories(false);
    }
  };

  // Bulk validate all eligible items - crash-proof chunked validation
  const triggerBulkValidate = async () => {
    setBulkValidating(true);
    
    try {
      // Step 1: Fetch total unverified count
      const { count: totalUnverified } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .eq('validation_status', 'unverified')
        .is('deleted_at', null);

      if (!totalUnverified || totalUnverified === 0) {
        toast({
          title: 'Niets te valideren',
          description: 'Alle items zijn al gevalideerd.',
        });
        setBulkValidating(false);
        return;
      }

      console.log(`🔄 Starting chunked validation: ${totalUnverified} items`);

      toast({
        title: "Bulk Validatie Gestart",
        description: `Verwerken van ${totalUnverified} items in chunks van 1000...`
      });

      // Step 2: Process in chunks of 1000
      const CHUNK_SIZE = 1000;
      const totalChunks = Math.ceil(totalUnverified / CHUNK_SIZE);
      let processedChunks = 0;
      let totalValidated = 0;

      for (let i = 0; i < totalChunks; i++) {
        console.log(`📦 Processing chunk ${i + 1}/${totalChunks}...`);
        
        // Call edge function for this chunk
        const { data, error } = await supabase.functions.invoke(
          'auto-validate-trusted-knowledge',
          {
            body: { 
              batch_size: CHUNK_SIZE,
              offset: i * CHUNK_SIZE 
            }
          }
        );

        if (error) {
          console.error(`❌ Chunk ${i + 1} failed:`, error);
          toast({
            title: 'Chunk fout',
            description: `Chunk ${i + 1}/${totalChunks} mislukt. Al ${totalValidated} items gevalideerd.`,
            variant: 'destructive',
          });
          break;
        }

        processedChunks++;
        totalValidated += data?.validated || 0;

        // Update progress
        setBulkProgress({ current: processedChunks, total: totalChunks });

        // Show progress toast
        toast({
          title: `Voortgang: ${Math.round((processedChunks / totalChunks) * 100)}%`,
          description: `${totalValidated} items gevalideerd (chunk ${processedChunks}/${totalChunks})`,
        });

        // Wait 2 seconds between chunks to prevent overload
        if (i < totalChunks - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Final success
      if (totalValidated > 0) {
        toast({
          title: '✅ Bulk validatie voltooid',
          description: `${totalValidated} items succesvol gevalideerd in ${processedChunks} batches.`,
        });
      } else {
        toast({
          title: 'ℹ️ Geen items voldoen aan auto-validatie criteria',
          description: (
            <div className="space-y-2">
              <p>{totalUnverified} items gevonden, maar geen enkele voldoet aan de trust criteria:</p>
              <ul className="list-disc list-inside text-xs space-y-1">
                <li>Vertrouwde bron (overheid.nl, etc.)</li>
                <li>Hoge confidence (≥0.7) + geen negatieve feedback</li>
                <li>Positieve gebruikersfeedback (≥2 votes)</li>
              </ul>
              <p className="text-xs mt-2">💡 Ga naar Knowledge Validator voor handmatige review.</p>
            </div>
          ),
        });
      }

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['validation-stats'] });

    } catch (error: any) {
      console.error('Bulk validate error:', error);
      toast({
        title: 'Fout',
        description: error instanceof Error ? error.message : 'Onbekende fout tijdens bulk validatie',
        variant: 'destructive',
      });
    } finally {
      setBulkValidating(false);
      setBulkProgress({ current: 0, total: 0 });
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
    if (!orchestratorState) return 'unknown';
    
    const metadata = orchestratorState.metadata as any;
    const isRunning = orchestratorState.status === 'running';
    const hasStaleHeartbeat = metadata?.last_heartbeat 
      ? (Date.now() - new Date(metadata.last_heartbeat).getTime()) > 300000
      : false;
    
    if (hasStaleHeartbeat) {
      return 'critical';
    }
    if (isRunning) {
      return 'warning';
    }
    return 'healthy';
  };

  const healthStatus = getHealthStatus();

  const dailyBudget = systemConfig?.daily_ai_budget_eur || 10;
  const budgetUsedPercent = dailySpend ? (dailySpend.total / dailyBudget) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Automation Control & Budget */}
      <Card className={systemConfig?.automation_paused ? "border-orange-500 bg-orange-50 dark:bg-orange-950/20" : "border-green-500 bg-green-50 dark:bg-green-950/20"}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-base flex items-center gap-2">
                {systemConfig?.automation_paused ? (
                  <>
                    <Pause className="w-5 h-5 text-orange-600" />
                    <span className="text-orange-900 dark:text-orange-100">Automaties Gepauzeerd</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 text-green-600" />
                    <span className="text-green-900 dark:text-green-100">Automaties Actief</span>
                  </>
                )}
              </CardTitle>
              <CardDescription className="mt-2">
                {systemConfig?.automation_paused 
                  ? "Alle automatische processen zijn gestopt. Klik 'Hervat' om ze weer te starten."
                  : "Automatische taken draaien volgens schema. Gebruik de pauzeknop om kosten te stoppen."}
              </CardDescription>
              
              {/* Budget Display */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Vandaag besteed:</span>
                  <span className={`font-bold ${budgetUsedPercent > 80 ? 'text-red-600' : budgetUsedPercent > 50 ? 'text-yellow-600' : 'text-green-600'}`}>
                    €{dailySpend?.total.toFixed(2) || '0.00'} / €{dailyBudget.toFixed(2)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all ${budgetUsedPercent > 80 ? 'bg-red-500' : budgetUsedPercent > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(budgetUsedPercent, 100)}%` }}
                  />
                </div>
                {budgetUsedPercent > 80 && (
                  <p className="text-xs text-red-600 font-medium">⚠️ Waarschuwing: meer dan 80% van dagbudget bereikt</p>
                )}
              </div>
            </div>
            
            <Button
              onClick={toggleAutomation}
              disabled={isTogglingAutomation}
              variant={systemConfig?.automation_paused ? "default" : "destructive"}
              className="shrink-0 ml-4"
            >
              {isTogglingAutomation ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : systemConfig?.automation_paused ? (
                <Play className="w-4 h-4 mr-2" />
              ) : (
                <Pause className="w-4 h-4 mr-2" />
              )}
              {isTogglingAutomation ? 'Bezig...' : systemConfig?.automation_paused ? 'Hervat Automatische Processen' : 'Pauzeer Automatische Processen'}
            </Button>
          </div>
        </CardHeader>
      </Card>

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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Run ID</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {orchestratorState.id ? orchestratorState.id.substring(0, 8) : '-'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge className={getStatusColor(orchestratorState.status)}>
                  {orchestratorState.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Last Heartbeat</span>
                <span className="text-sm font-mono">
                  {(orchestratorState.metadata as any)?.last_heartbeat 
                    ? new Date((orchestratorState.metadata as any).last_heartbeat as string).toLocaleTimeString('nl-NL')
                    : '-'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Processed / Remaining</span>
                <span className="text-sm font-mono">
                  {orchestratorState.total_items_processed || 0} / {(orchestratorState.metadata as any)?.total_missing || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current Batch</span>
                <span className="text-sm font-mono">
                  #{orchestratorState.current_batch || 0}
                </span>
              </div>
              
              <div className="flex gap-2 pt-2">
                {orchestratorState.status === 'running' ? (
                  <Button
                    onClick={stopBackfill}
                    variant="destructive"
                    className="flex-1"
                  >
                    <Pause className="mr-2 h-4 w-4" />
                    Stop Backfill
                  </Button>
                ) : (
                  <Button
                    onClick={triggerBackfill}
                    disabled={isStartingBackfill}
                    className="flex-1"
                  >
                    {isStartingBackfill ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Starting...
                      </>
                    ) : orchestratorState.status === 'paused' ? (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Resume Backfill
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Start Backfill
                      </>
                    )}
                  </Button>
                )}
                
                {(orchestratorState.status === 'running' || orchestratorState.status === 'paused') && (
                  <Button
                    onClick={forceRestartBackfill}
                    disabled={isStartingBackfill}
                    variant="outline"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Force Restart
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Geen actieve run</p>
          )}
        </CardContent>
      </Card>

      {/* Validation Coverage */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Validatie Coverage</CardTitle>
            <div className="flex gap-2">
              <Button
                onClick={triggerAutoValidate}
                disabled={isValidating || bulkValidating}
                size="sm"
                variant="outline"
              >
                <Play className={`w-4 h-4 mr-2 ${isValidating ? 'animate-spin' : ''}`} />
                {isValidating ? 'Valideren...' : 'Validate (1000)'}
              </Button>
              <Button
                onClick={triggerBulkValidate}
                disabled={bulkValidating || isValidating}
                size="sm"
                variant="default"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${bulkValidating ? 'animate-spin' : ''}`} />
                {bulkValidating 
                  ? `${bulkProgress.current}/${bulkProgress.total}`
                  : 'Bulk Validate All'}
              </Button>
            </div>
          </div>
          <CardDescription className="mt-2">
            Automatisch valideren van high-confidence knowledge items
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            <p className="mb-2">Valideert automatisch items met:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Confidence score ≥ 0.7</li>
              <li>Geen negatieve feedback</li>
              <li>Positieve feedback (≥2 votes)</li>
              <li>Trusted sources (overheid.nl, rijksoverheid.nl)</li>
            </ul>
            <Button
              onClick={() => window.location.href = '/ai-training?tab=validator'}
              variant="outline"
              size="sm"
              className="mt-3"
            >
              Open Knowledge Validator →
            </Button>
            {bulkValidating && (
              <div className="mt-4 p-3 bg-muted rounded-md">
                <p className="font-medium">Bulk validatie bezig...</p>
                <p className="text-xs mt-1">
                  Voortgang: {bulkProgress.current} / {bulkProgress.total} items
                </p>
              </div>
            )}
          </div>
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