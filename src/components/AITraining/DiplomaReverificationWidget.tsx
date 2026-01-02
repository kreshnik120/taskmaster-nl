import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle, AlertCircle, Clock, TrendingUp, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface ReverificationStats {
  signature_valid: number;
  duo_error: number;
  duo_not_digital: number;
  manual_review: number;
  verified_duo: number;
  total_reverifiable: number;
  max_retries_reached: number;
}

interface LockProgress {
  current: number;
  total: number;
  upgraded: number;
  errors: number;
}

interface LockMetadata {
  component?: string;
  started_at?: string;
  last_heartbeat?: string;
  triggered_by?: string;
  candidates_count?: number;
  progress?: LockProgress;
}

interface ActiveLock {
  id: string;
  status: string;
  metadata: LockMetadata | null;
}

const COMPONENT_NAME = 'reverify-diploma-signatures';

export function DiplomaReverificationWidget() {
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);

  // Check for active lock
  const { data: activeLock } = useQuery({
    queryKey: ['diploma-reverification-lock'],
    queryFn: async (): Promise<ActiveLock | null> => {
      const { data, error } = await supabase
        .from('orchestrator_state')
        .select('id, status, metadata')
        .eq('status', 'running')
        .filter('metadata->component', 'eq', COMPONENT_NAME)
        .maybeSingle();
      
      if (error) {
        console.error('Lock query error:', error);
        return null;
      }
      
      if (!data) return null;
      
      return {
        id: data.id,
        status: data.status,
        metadata: data.metadata as LockMetadata | null,
      };
    },
    refetchInterval: 5000, // Check every 5 seconds
  });

  // Fetch re-verification statistics
  const { data: stats, isLoading } = useQuery({
    queryKey: ['diploma-reverification-stats'],
    queryFn: async (): Promise<ReverificationStats> => {
      const { data: statusCounts, error } = await supabase
        .from('professional_applications')
        .select('diploma_validation_status, reverification_attempts')
        .not('diploma_file_path', 'is', null)
        .is('deleted_at', null);

      if (error) throw error;

      const counts: ReverificationStats = {
        signature_valid: 0,
        duo_error: 0,
        duo_not_digital: 0,
        manual_review: 0,
        verified_duo: 0,
        total_reverifiable: 0,
        max_retries_reached: 0,
      };

      statusCounts?.forEach((app) => {
        const status = app.diploma_validation_status;
        const attempts = app.reverification_attempts || 0;

        if (status === 'signature_valid') counts.signature_valid++;
        if (status === 'duo_error') counts.duo_error++;
        if (status === 'duo_not_digital') counts.duo_not_digital++;
        if (status === 'manual_review') counts.manual_review++;
        if (status === 'verified_duo') counts.verified_duo++;

        if (['signature_valid', 'duo_error', 'duo_not_digital', 'manual_review'].includes(status)) {
          if (attempts < 3) {
            counts.total_reverifiable++;
          } else {
            counts.max_retries_reached++;
          }
        }
      });

      return counts;
    },
    refetchInterval: 30000,
  });

  // Fetch recent re-verification events
  const { data: recentEvents } = useQuery({
    queryKey: ['diploma-reverification-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_learning_events')
        .select('*')
        .eq('event_type', 'diploma_reverification')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  // Manual trigger mutation
  const triggerMutation = useMutation({
    mutationFn: async () => {
      setIsRunning(true);
      const { data, error } = await supabase.functions.invoke('reverify-diploma-signatures', {
        body: { force: true }
      });
      
      // Check for 409 Conflict (lock active)
      if (error) {
        // Parse error to check if it's a lock conflict
        const errorMessage = error.message || '';
        if (errorMessage.includes('409') || errorMessage.includes('already in progress')) {
          throw new Error('LOCK_CONFLICT');
        }
        throw error;
      }
      
      return data;
    },
    onSuccess: (data) => {
      setIsRunning(false);
      queryClient.invalidateQueries({ queryKey: ['diploma-reverification-stats'] });
      queryClient.invalidateQueries({ queryKey: ['diploma-reverification-events'] });
      queryClient.invalidateQueries({ queryKey: ['diploma-reverification-lock'] });
      
      const summary = data?.summary;
      if (summary) {
        toast.success(
          `Re-verificatie voltooid: ${summary.upgraded} geüpgraded, ${summary.unchanged} ongewijzigd, ${summary.errors} fouten`
        );
      } else {
        toast.success('Re-verificatie voltooid');
      }
    },
    onError: (error: Error) => {
      setIsRunning(false);
      queryClient.invalidateQueries({ queryKey: ['diploma-reverification-lock'] });
      
      if (error.message === 'LOCK_CONFLICT') {
        toast.info('Re-verificatie is al actief. Wacht tot deze voltooid is.');
      } else {
        toast.error(`Re-verificatie mislukt: ${error.message}`);
      }
    },
  });

  const successRate = recentEvents?.length 
    ? Math.round((recentEvents.filter(e => e.outcome === 'upgrade_success').length / recentEvents.length) * 100)
    : 0;

  const progress = activeLock?.metadata?.progress;
  const isLocked = !!activeLock;
  const buttonDisabled = isRunning || isLoading || isLocked;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Diploma Re-Verificatie
            </CardTitle>
            <CardDescription>
              Upgrade signature_valid naar verified_duo via DUO
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => triggerMutation.mutate()}
            disabled={buttonDisabled}
          >
            {isLocked ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Actief ({progress?.current || 0}/{progress?.total || '?'})
              </>
            ) : isRunning ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Starten...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Nu uitvoeren
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active Lock Banner */}
        {isLocked && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="font-medium text-blue-700 dark:text-blue-300">Re-verificatie actief</span>
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-blue-600 dark:text-blue-400">Voortgang:</span>
                <span className="font-mono text-blue-700 dark:text-blue-300">
                  {progress?.current || 0} / {progress?.total || '?'} verwerkt
                </span>
              </div>
              {progress && (
                <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                  <div 
                    className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
                  />
                </div>
              )}
              <div className="flex gap-4 text-xs text-blue-600 dark:text-blue-400 mt-1">
                <span>✅ Upgraded: {progress?.upgraded || 0}</span>
                <span>❌ Errors: {progress?.errors || 0}</span>
              </div>
            </div>
          </div>
        )}

        {/* Statistics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-amber-600">
              {isLoading ? '...' : stats?.signature_valid || 0}
            </div>
            <div className="text-xs text-muted-foreground">Signature Valid</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-600">
              {isLoading ? '...' : stats?.verified_duo || 0}
            </div>
            <div className="text-xs text-muted-foreground">Verified DUO</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {isLoading ? '...' : stats?.total_reverifiable || 0}
            </div>
            <div className="text-xs text-muted-foreground">Te Herverifiëren</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-muted-foreground">
              {isLoading ? '...' : stats?.max_retries_reached || 0}
            </div>
            <div className="text-xs text-muted-foreground">Max Pogingen</div>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs">
            <AlertCircle className="h-3 w-3 mr-1 text-orange-500" />
            DUO Error: {stats?.duo_error || 0}
          </Badge>
          <Badge variant="outline" className="text-xs">
            <Clock className="h-3 w-3 mr-1 text-yellow-500" />
            Manual Review: {stats?.manual_review || 0}
          </Badge>
          <Badge variant="outline" className="text-xs">
            <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
            Succes Rate: {successRate}%
          </Badge>
        </div>

        {/* Recent Events */}
        {recentEvents && recentEvents.length > 0 && (
          <div className="border-t pt-3">
            <h4 className="text-sm font-medium mb-2">Recente Re-Verificaties</h4>
            <div className="space-y-1">
              {recentEvents.slice(0, 3).map((event) => {
                const context = event.context as Record<string, unknown>;
                return (
                  <div 
                    key={event.id} 
                    className="flex items-center justify-between text-xs py-1"
                  >
                    <span className="text-muted-foreground truncate max-w-[200px]">
                      {context?.email as string || context?.application_id as string || 'Onbekend'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {context?.previous_status as string} →
                      </span>
                      {event.outcome === 'upgrade_success' ? (
                        <Badge variant="default" className="text-xs bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          verified_duo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          {context?.new_status as string || 'unchanged'}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Schedule Info */}
        <div className="text-xs text-muted-foreground border-t pt-3">
          <span className="font-medium">Schema:</span> Elke zondag om 02:00 UTC • Max 10 per run • 7 dagen cooldown
        </div>
      </CardContent>
    </Card>
  );
}
