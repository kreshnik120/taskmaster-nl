import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AdminOnly } from "@/components/auth/AdminOnly";
import { toast } from "sonner";
import { 
  ShieldCheck, 
  ShieldAlert, 
  ShieldQuestion,
  RefreshCw,
  RotateCcw,
  Clock,
  Activity,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp
} from "lucide-react";
import { formatDistanceToNow, differenceInSeconds, addMinutes } from "date-fns";
import { nl } from "date-fns/locale";

const SERVICE_NAME = "verify-diploma-duo";
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const FAILURE_THRESHOLD = 5;
const SUCCESS_THRESHOLD = 2;

interface CircuitBreakerMetadata {
  cooldown_ms?: number;
  failure_threshold?: number;
  success_threshold?: number;
  last_state_change?: string;
  transition?: string;
  reset_reason?: string;
  trigger_error?: string;
}

interface StateChangeContext {
  service?: string;
  previous_state?: string;
  new_state?: string;
  trigger?: string;
  failure_count?: number;
  trigger_error?: string;
}

type CircuitState = 'closed' | 'open' | 'half_open';

const stateConfig: Record<CircuitState, {
  bg: string;
  border: string;
  text: string;
  label: string;
  icon: typeof ShieldCheck;
  description: string;
}> = {
  closed: {
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    text: "text-green-700 dark:text-green-400",
    label: "GESLOTEN",
    icon: ShieldCheck,
    description: "Service functioneert normaal",
  },
  open: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-700 dark:text-red-400",
    label: "OPEN",
    icon: ShieldAlert,
    description: "Service geblokkeerd - cooldown actief",
  },
  half_open: {
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    text: "text-yellow-700 dark:text-yellow-400",
    label: "HALF-OPEN",
    icon: ShieldQuestion,
    description: "Probe modus - test requests toegestaan",
  },
};

export function CircuitBreakerDashboard() {
  const queryClient = useQueryClient();
  const [cooldownRemaining, setCooldownRemaining] = useState<number | null>(null);

  // Query circuit breaker state (real-time, 5s interval)
  const { data: circuitState, isLoading: isLoadingState, refetch: refetchState } = useQuery({
    queryKey: ['circuit-breaker-state', SERVICE_NAME],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('circuit_breaker_state')
        .select('*')
        .eq('service_name', SERVICE_NAME)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  // Query state change events (30s interval)
  const { data: stateChangeEvents, isLoading: isLoadingEvents } = useQuery({
    queryKey: ['circuit-breaker-events', SERVICE_NAME],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_learning_events')
        .select('*')
        .eq('event_type', 'circuit_breaker_state_change')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  // Cooldown timer effect
  useEffect(() => {
    if (circuitState?.state !== 'open' || !circuitState.opened_at) {
      setCooldownRemaining(null);
      return;
    }

    const calculateRemaining = () => {
      const openedAt = new Date(circuitState.opened_at!);
      const cooldownEnd = addMinutes(openedAt, 30);
      const remaining = differenceInSeconds(cooldownEnd, new Date());
      return Math.max(0, remaining);
    };

    setCooldownRemaining(calculateRemaining());

    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setCooldownRemaining(remaining);
      
      // Auto-refresh when cooldown expires
      if (remaining <= 0) {
        refetchState();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [circuitState?.state, circuitState?.opened_at, refetchState]);

  // Reset mutation
  const resetMutation = useMutation({
    mutationFn: async () => {
      const previousState = circuitState?.state;
      
      const { data, error } = await supabase
        .from('circuit_breaker_state')
        .update({
          state: 'closed',
          failure_count: 0,
          success_count: 0,
          opened_at: null,
          half_open_at: null,
          last_error_message: null,
          updated_at: new Date().toISOString(),
          metadata: {
            cooldown_ms: COOLDOWN_MS,
            failure_threshold: FAILURE_THRESHOLD,
            success_threshold: SUCCESS_THRESHOLD,
            last_state_change: new Date().toISOString(),
            transition: `${previousState}_to_closed`,
            reset_reason: 'manual_admin_reset_dashboard',
          },
        })
        .eq('service_name', SERVICE_NAME)
        .select()
        .single();
        
      if (error) throw error;
      
      // Log reset event
      await supabase.from('ai_learning_events').insert({
        org_id: '550e8400-e29b-41d4-a716-446655440000',
        event_type: 'circuit_breaker_state_change',
        context: {
          service: SERVICE_NAME,
          previous_state: previousState,
          new_state: 'closed',
          trigger: 'manual_admin_reset_dashboard',
          reset_by: 'dashboard_ui',
        },
        outcome: `${previousState}_to_closed`,
        confidence_score: 1.0,
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circuit-breaker-state'] });
      queryClient.invalidateQueries({ queryKey: ['circuit-breaker-events'] });
      toast.success('Circuit breaker gereset naar GESLOTEN');
    },
    onError: (error: Error) => {
      toast.error(`Reset mislukt: ${error.message}`);
    },
  });

  // Format cooldown time
  const formatCooldown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate cooldown progress (100% = just opened, 0% = about to close)
  const cooldownProgress = cooldownRemaining !== null 
    ? (cooldownRemaining / (30 * 60)) * 100 
    : 0;

  // Get state configuration
  const currentState = (circuitState?.state as CircuitState) || 'closed';
  const config = stateConfig[currentState];
  const StateIcon = config.icon;

  // Calculate uptime percentage (based on metadata or default)
  const calculateUptime = (): number => {
    if (!circuitState?.last_success_at) return 100;
    const lastSuccess = new Date(circuitState.last_success_at);
    const lastFailure = circuitState.last_failure_at ? new Date(circuitState.last_failure_at) : null;
    
    if (!lastFailure || lastSuccess > lastFailure) return 100;
    
    // Simple calculation: if currently closed = 100%, open = 0%, half_open = 50%
    if (currentState === 'closed') return 100;
    if (currentState === 'open') return 0;
    return 50;
  };

  // Render failure indicator dots
  const renderFailureDots = () => {
    const count = circuitState?.failure_count || 0;
    return (
      <div className="flex gap-1.5">
        {Array.from({ length: FAILURE_THRESHOLD }).map((_, i) => (
          <div
            key={i}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              i < count 
                ? 'bg-red-500 shadow-sm shadow-red-500/50' 
                : 'bg-muted-foreground/20'
            }`}
          />
        ))}
      </div>
    );
  };

  // Get event icon and color
  const getEventDisplay = (context: StateChangeContext) => {
    const transition = `${context.previous_state || 'unknown'}_to_${context.new_state || 'unknown'}`;
    
    if (context.new_state === 'closed') {
      return { icon: CheckCircle, color: 'text-green-500', label: 'Gesloten' };
    }
    if (context.new_state === 'open') {
      return { icon: XCircle, color: 'text-red-500', label: 'Geopend' };
    }
    if (context.new_state === 'half_open') {
      return { icon: AlertTriangle, color: 'text-yellow-500', label: 'Half-open' };
    }
    return { icon: Activity, color: 'text-muted-foreground', label: transition };
  };

  if (isLoadingState) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Circuit Breaker Status</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetchState()}
            className="h-8 w-8"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* State Display Section */}
        <div className={`rounded-lg border p-4 ${config.bg} ${config.border}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${config.bg} ${currentState === 'open' ? 'animate-pulse' : ''}`}>
                <StateIcon className={`h-6 w-6 ${config.text}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`${config.text} ${config.border} font-semibold`}>
                    {config.label}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {SERVICE_NAME}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {config.description}
                </p>
              </div>
            </div>
            
            {/* Failure Dots Indicator */}
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground">Failures</span>
              {renderFailureDots()}
            </div>
          </div>
          
          {/* Cooldown Timer (only when OPEN) */}
          {currentState === 'open' && cooldownRemaining !== null && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Cooldown Timer</span>
                </div>
                <span className="text-lg font-mono font-bold text-red-600 dark:text-red-400">
                  {formatCooldown(cooldownRemaining)}
                </span>
              </div>
              <Progress 
                value={cooldownProgress} 
                className="h-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Herstart naar half-open na cooldown periode
              </p>
            </div>
          )}
          
          {/* Half-open probe status */}
          {currentState === 'half_open' && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm font-medium">Probe Status</span>
                </div>
                <Badge variant="outline" className="border-yellow-500/30 text-yellow-700 dark:text-yellow-400">
                  {circuitState?.success_count || 0} / {SUCCESS_THRESHOLD} successen nodig
                </Badge>
              </div>
            </div>
          )}
        </div>
        
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Failure Count */}
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-xs font-medium">Failures</span>
            </div>
            <p className="text-2xl font-bold">
              {circuitState?.failure_count || 0}
              <span className="text-sm font-normal text-muted-foreground">/{FAILURE_THRESHOLD}</span>
            </p>
          </div>
          
          {/* Success Count (for half-open) */}
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-xs font-medium">Successen</span>
            </div>
            <p className="text-2xl font-bold">
              {circuitState?.success_count || 0}
              <span className="text-sm font-normal text-muted-foreground">/{SUCCESS_THRESHOLD}</span>
            </p>
          </div>
          
          {/* Last Success */}
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-medium">Laatste Succes</span>
            </div>
            <p className="text-sm font-medium">
              {circuitState?.last_success_at 
                ? formatDistanceToNow(new Date(circuitState.last_success_at), { addSuffix: true, locale: nl })
                : 'Nooit'}
            </p>
          </div>
          
          {/* Uptime */}
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Activity className="h-4 w-4 text-purple-500" />
              <span className="text-xs font-medium">Status</span>
            </div>
            <p className={`text-2xl font-bold ${
              calculateUptime() === 100 ? 'text-green-600' : 
              calculateUptime() === 0 ? 'text-red-600' : 'text-yellow-600'
            }`}>
              {calculateUptime()}%
            </p>
          </div>
        </div>
        
        {/* State Changes Timeline */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Recente State Changes</h4>
          </div>
          
          {isLoadingEvents ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : stateChangeEvents && stateChangeEvents.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {stateChangeEvents.slice(0, 5).map((event) => {
                const context = (event.context || {}) as StateChangeContext;
                const display = getEventDisplay(context);
                const EventIcon = display.icon;
                
                return (
                  <div 
                    key={event.id}
                    className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 text-sm"
                  >
                    <EventIcon className={`h-4 w-4 ${display.color} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{context.previous_state || '?'}</span>
                      <span className="text-muted-foreground mx-1">→</span>
                      <span className="font-medium">{context.new_state || '?'}</span>
                      {context.trigger && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          ({context.trigger})
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(event.created_at!), { addSuffix: true, locale: nl })}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Geen state changes gelogd
            </p>
          )}
        </div>
        
        {/* Admin Reset Button */}
        <AdminOnly>
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Admin Acties</p>
                <p className="text-xs text-muted-foreground">
                  Reset de circuit breaker handmatig naar GESLOTEN
                </p>
              </div>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled={resetMutation.isPending || currentState === 'closed'}
                    className="gap-2"
                  >
                    <RotateCcw className={`h-4 w-4 ${resetMutation.isPending ? 'animate-spin' : ''}`} />
                    Reset Circuit
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Circuit Breaker Resetten?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Dit zal de circuit breaker voor <strong>{SERVICE_NAME}</strong> resetten naar de GESLOTEN state. 
                      Alle failure counts worden gewist en de service zal weer normale requests toestaan.
                      <br /><br />
                      <strong>Let op:</strong> Doe dit alleen als je zeker weet dat de externe service weer functioneert.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuleren</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => resetMutation.mutate()}
                      className="bg-primary"
                    >
                      Bevestig Reset
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </AdminOnly>
      </CardContent>
    </Card>
  );
}
