import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, Loader2, CheckCircle2, Sparkles, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface LearningStats {
  pendingEvents: number;
  byType: Record<string, number>;
  successPatterns: number;
}

export function TriggerLearningButton() {
  const [isLearning, setIsLearning] = useState(false);
  const [isPipelineLearning, setIsPipelineLearning] = useState(false);

  // Fetch pending learning events stats
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['learning-stats'],
    queryFn: async (): Promise<LearningStats> => {
      // Get pending events
      const { data: events } = await supabase
        .from('ai_learning_events')
        .select('event_type')
        .eq('applied_to_knowledge_base', false);

      const byType: Record<string, number> = {};
      (events || []).forEach(e => {
        byType[e.event_type] = (byType[e.event_type] || 0) + 1;
      });

      // Get success patterns count
      const { count: successPatterns } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .eq('category', 'success_patterns')
        .is('deleted_at', null);

      return {
        pendingEvents: events?.length || 0,
        byType,
        successPatterns: successPatterns || 0
      };
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const triggerContinuousLearner = async () => {
    setIsLearning(true);
    try {
      const { data, error } = await supabase.functions.invoke('continuous-learner', {
        body: { manual_trigger: true }
      });

      if (error) throw error;

      toast.success(`Learning voltooid`, {
        description: `${data?.processed || 0} events verwerkt`
      });
      
      refetchStats();
    } catch (err) {
      console.error('Continuous learner error:', err);
      toast.error('Learning mislukt', {
        description: err instanceof Error ? err.message : 'Onbekende fout'
      });
    } finally {
      setIsLearning(false);
    }
  };

  const triggerPipelineLearning = async () => {
    setIsPipelineLearning(true);
    try {
      const { data, error } = await supabase.functions.invoke('learn-from-pipeline', {
        body: { manual_trigger: true }
      });

      if (error) throw error;

      toast.success(`Pipeline learning voltooid`, {
        description: `${data?.processed || 0} pipeline events, ${data?.evaluation_learnings || 0} evaluaties verwerkt`
      });
      
      refetchStats();
    } catch (err) {
      console.error('Pipeline learner error:', err);
      toast.error('Pipeline learning mislukt', {
        description: err instanceof Error ? err.message : 'Onbekende fout'
      });
    } finally {
      setIsPipelineLearning(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">AI Learning Triggers</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {stats?.successPatterns || 0} success patterns
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Trigger AI learning handmatig om wachtende events te verwerken
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Pending events summary */}
        {stats && stats.pendingEvents > 0 && (
          <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {stats.pendingEvents} wachtende events
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(stats.byType).map(([type, count]) => (
                <Badge 
                  key={type} 
                  variant="secondary" 
                  className="text-[10px] bg-amber-100 text-amber-800"
                >
                  {type}: {count}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {stats?.pendingEvents === 0 && (
          <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-xs text-green-700 dark:text-green-300">
              Alle learning events zijn verwerkt
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={triggerContinuousLearner}
            disabled={isLearning}
            className="h-auto py-2 flex-col gap-1"
          >
            {isLearning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="text-xs">Continuous Learner</span>
            <span className="text-[10px] text-muted-foreground">
              Chat feedback & analyse
            </span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={triggerPipelineLearning}
            disabled={isPipelineLearning}
            className="h-auto py-2 flex-col gap-1"
          >
            {isPipelineLearning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="text-xs">Pipeline Learner</span>
            <span className="text-[10px] text-muted-foreground">
              Plaatsingen & evaluaties
            </span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}