import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Clock, AlertCircle, TrendingUp, Database, Zap, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const EmbeddingCoverageDashboard = () => {
  const [realtimeCount, setRealtimeCount] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Fetch coverage stats
  const { data: stats, isLoading } = useQuery({
    queryKey: ["embedding-coverage"],
    queryFn: async () => {
      // ✅ STAP 3: Haal org_id dynamisch op
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      if (!userOrg?.org_id) throw new Error('No organization found');

      // ✅ STAP 3: Gebruik HEAD counts (efficiënt, geen 400 errors)
      const { count: totalItems } = await supabase
        .from("ai_knowledge_base")
        .select("*", { count: "exact", head: true })
        .eq("org_id", userOrg.org_id)
        .is("deleted_at", null);

      const { count: embeddedCount } = await supabase
        .from("knowledge_embeddings")
        .select("*", { count: "exact", head: true });

      // Voor validation counts moeten we wel data ophalen (geen HEAD voor filters)
      const { data: validationData } = await supabase
        .from("ai_knowledge_base")
        .select("validation_status")
        .eq("org_id", userOrg.org_id)
        .is("deleted_at", null);

      const verifiedItems = validationData?.filter(d => d.validation_status === "verified").length || 0;
      const unverifiedItems = validationData?.filter(d => d.validation_status === "unverified").length || 0;

      const embeddingCoverage = (totalItems || 0) > 0 ? ((embeddedCount || 0) / (totalItems || 0)) * 100 : 0;
      const validationCoverage = (totalItems || 0) > 0 ? (verifiedItems / (totalItems || 0)) * 100 : 0;

      return {
        totalItems: totalItems || 0,
        embeddedItems: embeddedCount || 0,
        missingEmbeddings: (totalItems || 0) - (embeddedCount || 0),
        embeddingCoverage,
        verifiedItems,
        unverifiedItems,
        validationCoverage
      };
    },
    refetchInterval: 10000 // Refetch elke 10s
  });

  // Check orchestrator status
  const { data: orchestratorStatus } = useQuery({
    queryKey: ['orchestrator-status'],
    queryFn: async () => {
      // ✅ STAP 3: Haal org_id dynamisch op
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      if (!userOrg?.org_id) return null;

      const { data } = await supabase
        .from('orchestrator_state')
        .select('status, current_batch, total_items_processed, last_run_at, metadata, error_message')
        .eq('org_id', userOrg.org_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 10000,
  });

  // Realtime subscription voor embeddings
  useEffect(() => {
    const channel = supabase
      .channel('embedding-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'knowledge_embeddings'
        },
        () => {
          setRealtimeCount(prev => (prev || 0) + 1);
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Calculate ETA based on current processing speed
  const calculateETA = () => {
    if (!stats || stats.missingEmbeddings === 0) return null;
    
    // Average: 50 items per batch, ~28s per batch = ~6,500 items/hour
    const itemsPerHour = 6500;
    const hoursRemaining = stats.missingEmbeddings / itemsPerHour;
    
    if (hoursRemaining < 1) {
      return `~${Math.round(hoursRemaining * 60)} minuten`;
    } else {
      return `~${Math.round(hoursRemaining * 10) / 10} uur`;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const eta = calculateETA();
  const isBackfillActive = orchestratorStatus?.status === 'running';
  const metadataLastHeartbeat = orchestratorStatus?.metadata && typeof orchestratorStatus.metadata === 'object' && 'last_heartbeat' in orchestratorStatus.metadata ? orchestratorStatus.metadata.last_heartbeat : null;
  const lastHeartbeat = metadataLastHeartbeat ? new Date(metadataLastHeartbeat as string) : orchestratorStatus?.last_run_at ? new Date(orchestratorStatus.last_run_at) : null;
  const isStale = lastHeartbeat && (Date.now() - lastHeartbeat.getTime()) > 5 * 60 * 1000;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Kennisbank Dekking
              {isBackfillActive && !isStale && (
                <Activity className="h-4 w-4 text-green-500 animate-pulse" />
              )}
            </CardTitle>
            <CardDescription>
              Real-time status van embeddings en validatie
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {isBackfillActive && !isStale && (
              <Badge variant="default" className="animate-pulse gap-1">
                <Zap className="h-3 w-3" />
                Actief bezig
              </Badge>
            )}
            {realtimeCount && realtimeCount > 0 && (
              <Badge variant="outline" className="gap-1">
                +{realtimeCount} nieuwe
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Orchestrator Status */}
        {orchestratorStatus && (
          <Alert className={
            orchestratorStatus.status === 'running' && !isStale ? 'border-green-500 bg-green-50 dark:bg-green-950' :
            orchestratorStatus.status === 'paused' ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950' :
            orchestratorStatus.status === 'idle' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' :
            'border-red-500 bg-red-50 dark:bg-red-950'
          }>
            <Activity className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <div className="font-semibold">
                Backfill Status: {orchestratorStatus.status.toUpperCase()}
                {orchestratorStatus.status === 'running' && !isStale && ' 🟢'}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Batch: {orchestratorStatus.current_batch || 0}</div>
                <div>Verwerkt: {orchestratorStatus.total_items_processed || 0}</div>
                {lastHeartbeat && (
                  <>
                    <div>Laatste heartbeat: {lastHeartbeat.toLocaleTimeString('nl-NL')}</div>
                    <div>Laatste run: {orchestratorStatus.last_run_at ? new Date(orchestratorStatus.last_run_at).toLocaleTimeString('nl-NL') : 'N/A'}</div>
                  </>
                )}
              </div>
              {/* ✅ STAP 3: Toon laatste error_message */}
              {orchestratorStatus.status === 'paused' && orchestratorStatus.metadata && typeof orchestratorStatus.metadata === 'object' && 'pause_reason' in orchestratorStatus.metadata && (
                <div className="mt-2 text-sm text-yellow-600 font-medium">
                  ⚠️ Reden: {String(orchestratorStatus.metadata.pause_reason)}
                </div>
              )}
              {orchestratorStatus.status === 'running' && !isStale && eta && (
                <div className="mt-2 text-sm font-medium">
                  🕒 Geschatte resterende tijd: {eta}
                </div>
              )}
              {isStale && (
                <div className="mt-2 text-sm text-red-600 font-medium">
                  ⚠️ Waarschuwing: Heartbeat is ouder dan 5 minuten - proces mogelijk vastgelopen
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Realtime Updates */}
        {realtimeCount && realtimeCount > 0 && (
          <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription>
              {realtimeCount} nieuwe embeddings toegevoegd in deze sessie
              <br />
              <span className="text-xs text-muted-foreground">
                Laatste update: {lastUpdate.toLocaleTimeString('nl-NL')}
              </span>
            </AlertDescription>
          </Alert>
        )}

        {/* Warnings */}
        {!isBackfillActive && stats && stats.missingEmbeddings > 100 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Backfill proces is niet actief. Er zijn nog {stats.missingEmbeddings} items zonder embeddings.
            </AlertDescription>
          </Alert>
        )}

        {/* Embedding Coverage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="font-semibold">Embedding Coverage</span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold">{stats?.embeddingCoverage.toFixed(1)}%</span>
              <span className="text-sm text-muted-foreground ml-2">
                ({stats?.embeddedItems}/{stats?.totalItems})
              </span>
            </div>
          </div>
          <Progress value={stats?.embeddingCoverage || 0} className="h-2" />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {stats?.missingEmbeddings === 0 ? (
                <span className="text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Volledig!
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {stats?.missingEmbeddings} items nog te verwerken
                </span>
              )}
            </span>
            {eta && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                ETA: {eta}
              </span>
            )}
          </div>
          {isBackfillActive && orchestratorStatus?.current_batch && (
            <div className="text-xs text-muted-foreground mt-1">
              Huidige batch: {orchestratorStatus.current_batch} ({orchestratorStatus.total_items_processed} verwerkt)
            </div>
          )}
        </div>

        {/* Validation Coverage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="font-semibold">Validatie Coverage</span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold">{stats?.validationCoverage.toFixed(1)}%</span>
              <span className="text-sm text-muted-foreground ml-2">
                ({stats?.verifiedItems}/{stats?.totalItems})
              </span>
            </div>
          </div>
          <Progress value={stats?.validationCoverage || 0} className="h-2" />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {stats?.unverifiedItems === 0 ? (
                <span className="text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Alles geverifieerd!
                </span>
              ) : (
                <span>{stats?.unverifiedItems} items wachten op verificatie</span>
              )}
            </span>
          </div>
        </div>

        {/* Status indicators */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats?.embeddedItems}</div>
            <div className="text-xs text-muted-foreground">Met Embeddings</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats?.verifiedItems}</div>
            <div className="text-xs text-muted-foreground">Geverifieerd</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{stats?.missingEmbeddings}</div>
            <div className="text-xs text-muted-foreground">In Wachtrij</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};