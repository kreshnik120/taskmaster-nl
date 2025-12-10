import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, Loader2, CheckCircle2, Sparkles, RefreshCw, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";

interface LearningStats {
  pendingEvents: number;
  byType: Record<string, number>;
  successPatterns: number;
  embeddingsMissing: number;
  geminiItems: number;
}

export function TriggerLearningButton() {
  const [isLearning, setIsLearning] = useState(false);
  const [isPipelineLearning, setIsPipelineLearning] = useState(false);
  const [isGeneratingEmbeddings, setIsGeneratingEmbeddings] = useState(false);
  const [embeddingProgress, setEmbeddingProgress] = useState(0);

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

      // Get Gemini research items count
      const { count: geminiItems } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .eq('source_type', 'gemini_deep_research')
        .is('deleted_at', null);

      // Get embeddings missing count - alternative direct count query

      // Alternative: direct count query
      const { count: totalKnowledge } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);

      const { count: withEmbeddings } = await supabase
        .from('knowledge_embeddings')
        .select('*', { count: 'exact', head: true });

      const embeddingsMissing = (totalKnowledge || 0) - (withEmbeddings || 0);

      return {
        pendingEvents: events?.length || 0,
        byType,
        successPatterns: successPatterns || 0,
        embeddingsMissing: Math.max(0, embeddingsMissing),
        geminiItems: geminiItems || 0
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

  const triggerEmbeddingGeneration = async () => {
    setIsGeneratingEmbeddings(true);
    setEmbeddingProgress(0);
    
    try {
      // Get IDs of items without embeddings (batch of 50)
      const { data: ids, error: fetchError } = await supabase
        .from('ai_knowledge_base')
        .select('id')
        .is('deleted_at', null)
        .order('confidence_score', { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;

      // Filter out items that already have embeddings
      const { data: existingEmbeddings } = await supabase
        .from('knowledge_embeddings')
        .select('knowledge_id')
        .in('knowledge_id', ids?.map(i => i.id) || []);

      const existingIds = new Set(existingEmbeddings?.map(e => e.knowledge_id) || []);
      const idsToProcess = ids?.filter(i => !existingIds.has(i.id)).map(i => i.id) || [];

      if (idsToProcess.length === 0) {
        toast.success('Alle embeddings zijn al gegenereerd!');
        refetchStats();
        return;
      }

      // Process in batch
      const { data, error } = await supabase.functions.invoke('generate-embedding', {
        body: { knowledge_ids: idsToProcess }
      });

      if (error) throw error;

      const successCount = data?.results?.filter((r: any) => r.success).length || 0;
      
      toast.success(`Embeddings gegenereerd`, {
        description: `${successCount}/${idsToProcess.length} embeddings aangemaakt. ${stats?.embeddingsMissing ? stats.embeddingsMissing - successCount : 0} nog te verwerken.`
      });
      
      refetchStats();
    } catch (err) {
      console.error('Embedding generation error:', err);
      toast.error('Embedding generatie mislukt', {
        description: err instanceof Error ? err.message : 'Onbekende fout'
      });
    } finally {
      setIsGeneratingEmbeddings(false);
      setEmbeddingProgress(0);
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

        {/* Embeddings Missing Alert */}
        {(stats?.embeddingsMissing || 0) > 0 && (
          <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                {stats?.embeddingsMissing.toLocaleString()} items zonder embedding
              </span>
              {stats?.geminiItems && (
                <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-800">
                  {stats.geminiItems.toLocaleString()} Gemini items
                </Badge>
              )}
            </div>
            {isGeneratingEmbeddings && (
              <Progress value={embeddingProgress} className="h-1 mt-2" />
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-2">
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
            <span className="text-xs">Continuous</span>
            <span className="text-[10px] text-muted-foreground">
              Chat feedback
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
            <span className="text-xs">Pipeline</span>
            <span className="text-[10px] text-muted-foreground">
              Plaatsingen
            </span>
          </Button>

          <Button
            variant={(stats?.embeddingsMissing || 0) > 0 ? "default" : "outline"}
            size="sm"
            onClick={triggerEmbeddingGeneration}
            disabled={isGeneratingEmbeddings || (stats?.embeddingsMissing || 0) === 0}
            className="h-auto py-2 flex-col gap-1"
          >
            {isGeneratingEmbeddings ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            <span className="text-xs">Embeddings</span>
            <span className="text-[10px] text-muted-foreground">
              {(stats?.embeddingsMissing || 0) > 0 ? `${Math.min(50, stats?.embeddingsMissing || 0)} batch` : 'Klaar'}
            </span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}