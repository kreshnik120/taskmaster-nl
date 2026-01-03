import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, Loader2, CheckCircle2, Sparkles, RefreshCw, Zap, Play, Square, TrendingUp, Activity, GitBranch } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface LearningStats {
  pendingEvents: number;
  byType: Record<string, number>;
  successPatterns: number;
  embeddingsMissing: number;
  geminiItems: number;
  // Velocity metrics
  learningVelocity: {
    today: number;
    week: number;
    trend: 'up' | 'down' | 'stable';
  };
  knowledgeGrowth: {
    today: number;
    week: number;
  };
  relationshipsGrowth: {
    today: number;
    week: number;
  };
  embeddingCoverage: number;
}

export function TriggerLearningButton() {
  const [isLearning, setIsLearning] = useState(false);
  const [isPipelineLearning, setIsPipelineLearning] = useState(false);
  const [isGeneratingEmbeddings, setIsGeneratingEmbeddings] = useState(false);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [embeddingProgress, setEmbeddingProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const abortRef = useRef(false);

  // Fetch pending learning events stats with velocity metrics
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['learning-stats-velocity'],
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

      // Get embeddings stats
      const { count: totalKnowledge } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);

      const { count: withEmbeddings } = await supabase
        .from('knowledge_embeddings')
        .select('*', { count: 'exact', head: true });

      const embeddingsMissing = (totalKnowledge || 0) - (withEmbeddings || 0);
      const embeddingCoverage = totalKnowledge ? Math.round((withEmbeddings || 0) / totalKnowledge * 100) : 0;

      // Get learning velocity (events per day)
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      const { data: todayEvents } = await supabase
        .from('ai_learning_events')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', today);

      const { data: weekEvents } = await supabase
        .from('ai_learning_events')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', weekAgo);

      // Get knowledge growth
      const { count: todayKnowledge } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today)
        .is('deleted_at', null);

      const { count: weekKnowledge } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekAgo)
        .is('deleted_at', null);

      // Get relationships growth
      const { count: todayRelations } = await supabase
        .from('knowledge_relationships')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today);

      const { count: weekRelations } = await supabase
        .from('knowledge_relationships')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekAgo);

      // Determine trend based on recent vs older activity
      const recentAvg = (todayEvents?.length || 0);
      const weekAvg = Math.round((weekEvents?.length || 0) / 7);
      const trend = recentAvg > weekAvg ? 'up' : recentAvg < weekAvg ? 'down' : 'stable';

      return {
        pendingEvents: events?.length || 0,
        byType,
        successPatterns: successPatterns || 0,
        embeddingsMissing: Math.max(0, embeddingsMissing),
        geminiItems: geminiItems || 0,
        learningVelocity: {
          today: todayEvents?.length || 0,
          week: weekEvents?.length || 0,
          trend
        },
        knowledgeGrowth: {
          today: todayKnowledge || 0,
          week: weekKnowledge || 0
        },
        relationshipsGrowth: {
          today: todayRelations || 0,
          week: weekRelations || 0
        },
        embeddingCoverage
      };
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const triggerContinuousLearner = async () => {
    setIsLearning(true);
    try {
      // Fetch recent unprocessed chat interactions from ai_chat_messages
      const { data: recentChats, error: chatError } = await supabase
        .from('ai_chat_messages')
        .select('content, role, used_knowledge, confidence_score, conversation_id')
        .order('created_at', { ascending: false })
        .limit(20);

      if (chatError) throw chatError;

      // Group by conversation_id and process pairs
      const conversations = new Map<string, { question?: string; response?: string; knowledge?: unknown[] }>();
      
      for (const msg of recentChats || []) {
        const convId = msg.conversation_id || 'default';
        if (!conversations.has(convId)) {
          conversations.set(convId, {});
        }
        const conv = conversations.get(convId)!;
        
        if (msg.role === 'user' && !conv.question) {
          conv.question = msg.content;
        } else if (msg.role === 'assistant' && !conv.response) {
          conv.response = msg.content;
          conv.knowledge = msg.used_knowledge as unknown[] || [];
        }
      }

      // Count complete conversation pairs first
      const completePairs = Array.from(conversations.values()).filter(c => c.question && c.response);
      
      if (completePairs.length === 0) {
        toast.info('Geen complete chat conversaties gevonden om te analyseren', {
          description: 'Er moeten zowel user vragen als AI antwoorden aanwezig zijn'
        });
        setIsLearning(false);
        return;
      }

      // Process complete conversation pairs via unified-learner
      let processed = 0;
      for (const conv of completePairs) {
        const { error } = await supabase.functions.invoke('unified-learner', {
          body: { 
            action: 'analyze_chat',
            user_question: conv.question,
            ai_response: conv.response,
            knowledge_used: conv.knowledge || [],
            auto_apply: true
          }
        });

        if (error) {
          console.error('Unified learner error for conversation:', error);
        } else {
          processed++;
        }
        
        // Process max 3 conversations per manual trigger
        if (processed >= 3) break;
      }

      if (processed > 0) {
        toast.success(`Learning voltooid`, {
          description: `${processed} chat conversaties geanalyseerd`
        });
      } else {
        toast.info('Geen recente chats gevonden om te analyseren');
      }
      
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
      // Migrated to unified-learner with learn_pipeline action
      const { data, error } = await supabase.functions.invoke('unified-learner', {
        body: { 
          action: 'learn_pipeline',
          days_back: 7,
          manual_trigger: true
        }
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

  const triggerSingleBatch = async () => {
    setIsGeneratingEmbeddings(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-embedding', {
        body: { batch_mode: 'auto', batch_size: 50 }
      });

      if (error) throw error;

      const processed = data?.processed || 0;
      const remaining = data?.remaining || 0;
      
      toast.success(`Embeddings gegenereerd`, {
        description: `${processed} embeddings aangemaakt. ${remaining} nog te verwerken.`
      });
      
      refetchStats();
    } catch (err) {
      console.error('Embedding generation error:', err);
      toast.error('Embedding generatie mislukt', {
        description: err instanceof Error ? err.message : 'Onbekende fout'
      });
    } finally {
      setIsGeneratingEmbeddings(false);
    }
  };

  const startAutoGeneration = async () => {
    if (isAutoGenerating) {
      // Stop
      abortRef.current = true;
      setIsAutoGenerating(false);
      toast.info('Auto-generatie gestopt');
      return;
    }

    abortRef.current = false;
    setIsAutoGenerating(true);
    setProcessedCount(0);
    setTotalToProcess(stats?.embeddingsMissing || 0);
    
    let totalProcessed = 0;
    let remaining = stats?.embeddingsMissing || 0;
    let consecutiveZeros = 0;

    toast.info('Auto-generatie gestart', {
      description: `${remaining.toLocaleString()} items te verwerken...`
    });

    while (remaining > 0 && !abortRef.current && consecutiveZeros < 3) {
      try {
        const { data, error } = await supabase.functions.invoke('generate-embedding', {
          body: { batch_mode: 'auto', batch_size: 50 }
        });

        if (error) {
          console.error('Batch error:', error);
          // Wait and retry
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        const processed = data?.processed || 0;
        remaining = data?.remaining || 0;
        
        if (processed === 0) {
          consecutiveZeros++;
        } else {
          consecutiveZeros = 0;
          totalProcessed += processed;
          setProcessedCount(totalProcessed);
          setTotalToProcess(Math.max(remaining + totalProcessed, stats?.embeddingsMissing || 0));
        }

        // Update progress
        const progress = totalProcessed / (totalProcessed + remaining) * 100;
        setEmbeddingProgress(Math.min(progress, 100));
        
        // Refetch stats periodically
        if (totalProcessed % 200 === 0) {
          refetchStats();
        }

        // Wait 2 seconds between batches to avoid rate limits
        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        console.error('Auto-generation error:', err);
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    setIsAutoGenerating(false);
    setEmbeddingProgress(100);
    refetchStats();
    
    if (abortRef.current) {
      toast.info(`Auto-generatie gepauzeerd`, {
        description: `${totalProcessed.toLocaleString()} embeddings gegenereerd. ${remaining.toLocaleString()} nog te gaan.`
      });
    } else if (remaining === 0) {
      toast.success(`Alle embeddings gegenereerd!`, {
        description: `${totalProcessed.toLocaleString()} embeddings totaal aangemaakt.`
      });
    }
  };

  const estimatedTimeRemaining = () => {
    if (!stats?.embeddingsMissing) return '';
    // ~50 items per 3 seconds = 1000 items per minute
    const minutesRemaining = Math.ceil(stats.embeddingsMissing / 1000);
    if (minutesRemaining > 60) {
      return `~${Math.ceil(minutesRemaining / 60)}u`;
    }
    return `~${minutesRemaining}min`;
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
          Trigger AI learning handmatig of automatisch
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Learning Velocity Metrics - NEW */}
        <TooltipProvider>
          <div className="grid grid-cols-3 gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center cursor-help">
                  <div className="flex items-center justify-center gap-1">
                    <Activity className="h-3 w-3 text-blue-600" />
                    <span className="text-lg font-bold text-blue-700 dark:text-blue-300">
                      {stats?.learningVelocity?.today || 0}
                    </span>
                    {stats?.learningVelocity?.trend === 'up' && (
                      <TrendingUp className="h-3 w-3 text-green-500" />
                    )}
                  </div>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400">Events vandaag</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{stats?.learningVelocity?.week || 0} events deze week</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-center cursor-help">
                  <div className="flex items-center justify-center gap-1">
                    <Sparkles className="h-3 w-3 text-emerald-600" />
                    <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                      {stats?.knowledgeGrowth?.today || 0}
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Kennis vandaag</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{stats?.knowledgeGrowth?.week || 0} nieuwe items deze week</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-2 bg-violet-50 dark:bg-violet-900/20 rounded-lg text-center cursor-help">
                  <div className="flex items-center justify-center gap-1">
                    <GitBranch className="h-3 w-3 text-violet-600" />
                    <span className="text-lg font-bold text-violet-700 dark:text-violet-300">
                      {stats?.relationshipsGrowth?.today || 0}
                    </span>
                  </div>
                  <span className="text-[10px] text-violet-600 dark:text-violet-400">Links vandaag</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{stats?.relationshipsGrowth?.week?.toLocaleString() || 0} relaties deze week</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        {/* Embedding Coverage Bar - NEW */}
        <div className="p-2 bg-muted/50 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium">Embedding Coverage</span>
            <span className="text-xs font-bold text-primary">{stats?.embeddingCoverage || 0}%</span>
          </div>
          <Progress value={stats?.embeddingCoverage || 0} className="h-1.5" />
        </div>

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

        {/* Embeddings Missing Alert with Auto-Generate */}
        {(stats?.embeddingsMissing || 0) > 0 && (
          <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                {isAutoGenerating 
                  ? `${processedCount.toLocaleString()} / ${totalToProcess.toLocaleString()} verwerkt`
                  : `${stats?.embeddingsMissing.toLocaleString()} items zonder embedding`
                }
              </span>
              <div className="flex items-center gap-1">
                {!isAutoGenerating && stats?.embeddingsMissing && (
                  <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-800">
                    {estimatedTimeRemaining()}
                  </Badge>
                )}
                {stats?.geminiItems && (
                  <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-800">
                    {stats.geminiItems.toLocaleString()} Gemini
                  </Badge>
                )}
              </div>
            </div>
            {(isAutoGenerating || embeddingProgress > 0) && (
              <Progress value={embeddingProgress} className="h-1.5 mt-2" />
            )}
          </div>
        )}

        {/* All embeddings complete */}
        {(stats?.embeddingsMissing || 0) === 0 && (
          <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-xs text-green-700 dark:text-green-300">
              Alle embeddings zijn gegenereerd
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
        </div>

        {/* Embedding buttons - full width */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={triggerSingleBatch}
            disabled={isGeneratingEmbeddings || isAutoGenerating || (stats?.embeddingsMissing || 0) === 0}
            className="h-auto py-2 flex-col gap-1"
          >
            {isGeneratingEmbeddings ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            <span className="text-xs">1 Batch</span>
            <span className="text-[10px] text-muted-foreground">
              50 items
            </span>
          </Button>

          <Button
            variant={isAutoGenerating ? "destructive" : (stats?.embeddingsMissing || 0) > 0 ? "default" : "outline"}
            size="sm"
            onClick={startAutoGeneration}
            disabled={isGeneratingEmbeddings || (stats?.embeddingsMissing || 0) === 0}
            className="h-auto py-2 flex-col gap-1"
          >
            {isAutoGenerating ? (
              <Square className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span className="text-xs">{isAutoGenerating ? 'Stop' : 'Auto-All'}</span>
            <span className="text-[10px] text-muted-foreground">
              {isAutoGenerating ? 'Stoppen' : 'Volledig'}
            </span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
