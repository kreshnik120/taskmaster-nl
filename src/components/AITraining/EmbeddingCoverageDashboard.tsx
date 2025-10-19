import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertCircle, TrendingUp, Database, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const EmbeddingCoverageDashboard = () => {
  const [realtimeCount, setRealtimeCount] = useState<number | null>(null);

  // Fetch coverage stats
  const { data: stats, isLoading } = useQuery({
    queryKey: ["embedding-coverage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_knowledge_base")
        .select("id, validation_status")
        .is("deleted_at", null);

      if (error) throw error;

      const totalItems = data.length;
      
      // Count items met embeddings
      const { count: embeddedCount } = await supabase
        .from("knowledge_embeddings")
        .select("*", { count: "exact", head: true });

      const verifiedItems = data.filter(d => d.validation_status === "verified").length;
      const unverifiedItems = data.filter(d => d.validation_status === "unverified").length;

      const embeddingCoverage = totalItems > 0 ? (embeddedCount || 0) / totalItems * 100 : 0;
      const validationCoverage = totalItems > 0 ? verifiedItems / totalItems * 100 : 0;

      return {
        totalItems,
        embeddedItems: embeddedCount || 0,
        missingEmbeddings: totalItems - (embeddedCount || 0),
        embeddingCoverage,
        verifiedItems,
        unverifiedItems,
        validationCoverage
      };
    },
    refetchInterval: 10000 // Refetch elke 10s
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Calculate ETA
  const calculateETA = () => {
    if (!stats || stats.missingEmbeddings === 0) return null;
    
    // Aanname: 200 items per 15 min (met nieuwe config)
    const itemsPerMinute = 200 / 15;
    const minutesRemaining = Math.ceil(stats.missingEmbeddings / itemsPerMinute);
    
    if (minutesRemaining < 60) {
      return `~${minutesRemaining} minuten`;
    } else if (minutesRemaining < 1440) {
      const hours = Math.ceil(minutesRemaining / 60);
      return `~${hours} ${hours === 1 ? 'uur' : 'uur'}`;
    } else {
      const days = Math.ceil(minutesRemaining / 1440);
      return `~${days} ${days === 1 ? 'dag' : 'dagen'}`;
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

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Kennisbank Dekking
            </CardTitle>
            <CardDescription>
              Real-time status van embeddings en validatie
            </CardDescription>
          </div>
          {realtimeCount && realtimeCount > 0 && (
            <Badge variant="outline" className="gap-1 animate-pulse">
              <Zap className="h-3 w-3" />
              +{realtimeCount} nieuwe
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
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