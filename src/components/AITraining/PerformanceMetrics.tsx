import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, TrendingDown, Activity, Loader2, RefreshCw } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Metric {
  id: string;
  metric_type: string;
  value: number;
  sample_size: number;
  period_start: string;
  period_end: string;
  metadata: any;
  created_at: string;
}

export function PerformanceMetrics() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReviewing, setIsReviewing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get user's org
      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', session.user.id)
        .single();

      if (!userOrg) return;

      // Get latest metrics for today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('ai_performance_metrics')
        .select('*')
        .eq('org_id', userOrg.org_id)
        .gte('period_start', today.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Get unique metrics (latest of each type) - filter out empty samples
      const uniqueMetrics = data?.reduce((acc: Metric[], metric) => {
        if (!acc.find(m => m.metric_type === metric.metric_type) && metric.sample_size > 0) {
          acc.push(metric);
        }
        return acc;
      }, []) || [];

      setMetrics(uniqueMetrics);
    } catch (error: any) {
      console.error('Error loading metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerReview = async () => {
    setIsReviewing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Niet ingelogd');

      const { data, error } = await supabase.functions.invoke('review-knowledge');

      if (error) throw error;

      toast({
        title: "✅ Review voltooid",
        description: `${data.stats.total_processed} items verwerkt`,
      });

      // Reload metrics after review
      setTimeout(loadMetrics, 1000);
    } catch (error: any) {
      console.error('Error triggering review:', error);
      toast({
        title: "Fout bij review",
        description: error.message || "Kon review niet starten",
        variant: "destructive",
      });
    } finally {
      setIsReviewing(false);
    }
  };

  const getMetricInfo = (type: string) => {
    switch (type) {
      case 'auto_resolve_success_rate':
        return {
          title: 'Auto-resolve Slagingspercentage',
          description: 'Percentage succesvolle automatische conflictoplossingen',
          icon: TrendingUp,
        };
      case 'suggestion_acceptance_rate':
        return {
          title: 'Suggestie Acceptatie',
          description: 'Percentage geaccepteerde AI suggesties',
          icon: Activity,
        };
      case 'conflict_detection_accuracy':
        return {
          title: 'Conflict Detectie Nauwkeurigheid',
          description: 'Nauwkeurigheid van conflict detectie',
          icon: TrendingUp,
        };
      case 'false_positive_rate':
        return {
          title: 'Fout-Positief Ratio',
          description: 'Percentage incorrecte conflict detecties',
          icon: TrendingDown,
        };
      default:
        return {
          title: type,
          description: 'Performance metric',
          icon: Activity,
        };
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">AI Performance Metrics</h3>
          <p className="text-sm text-muted-foreground">
            Real-time prestatie-indicatoren van het AI systeem
          </p>
        </div>
        <Button onClick={triggerReview} disabled={isReviewing} size="sm">
          {isReviewing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Bezig met reviewen...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Start Review
            </>
          )}
        </Button>
      </div>

      {metrics.length === 0 ? (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
          <CardContent className="text-center py-8">
            <div className="flex flex-col items-center gap-3">
              <div className="text-4xl">✅</div>
              <h4 className="font-semibold text-green-900 dark:text-green-100">
                Kennisbank is gezond
              </h4>
              <p className="text-sm text-green-700 dark:text-green-300 max-w-md">
                Geen items vereisen momenteel review. Alle kennis is recent, 
                consistent en van goede kwaliteit.
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                💡 Metrics verschijnen zodra er conflicten of verouderde data wordt gedetecteerd
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metrics.map((metric) => {
            const info = getMetricInfo(metric.metric_type);
            const Icon = info.icon;
            const percentage = metric.value * 100;
            
            return (
              <Card key={metric.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="text-2xl font-bold">
                      {percentage.toFixed(1)}%
                    </span>
                  </div>
                  <CardTitle className="text-base">{info.title}</CardTitle>
                  <CardDescription>{info.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Progress value={percentage} className="h-2 mb-2" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Sample: {metric.sample_size} items</span>
                    {metric.metadata && (
                      <span>
                        {metric.metadata.reviewed && `✓ ${metric.metadata.reviewed}`}
                        {metric.metadata.auto_resolved && ` • 🤖 ${metric.metadata.auto_resolved}`}
                        {metric.metadata.cleaned_up && ` • 🧹 ${metric.metadata.cleaned_up}`}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
