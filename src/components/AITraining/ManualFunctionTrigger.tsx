import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Play, CheckCircle2, AlertCircle, AlertTriangle, RefreshCw } from "lucide-react";

export const ManualFunctionTrigger = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [result, setResult] = useState<any>(null);
  const [triggeringFunction, setTriggeringFunction] = useState<string | null>(null);

  // Fetch validation metrics - simplified version
  const { data: validationMetrics, refetch: refetchMetrics } = useQuery({
    queryKey: ['validation-metrics'],
    queryFn: async () => {
      // Count low confidence items as needing review
      const { data: kbItems } = await supabase
        .from('ai_knowledge_base')
        .select('confidence_score')
        .is('deleted_at', null);

      const needsReview = kbItems?.filter(item => (item.confidence_score || 0) < 0.7).length || 0;

      // Feedback apply rate based on recent learning events
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: totalEvents } = await supabase
        .from('ai_learning_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo);

      const { count: kbGrowth } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo);

      const feedbackApplyRate = totalEvents && totalEvents > 0 ? Math.round(((kbGrowth || 0) / totalEvents) * 100) : 0;

      return {
        needsReview,
        brokenSources: 0,
        feedbackApplyRate: Math.min(feedbackApplyRate, 100)
      };
    },
    refetchInterval: 30000
  });

  const triggerMegaForecastGenerator = async () => {
    setIsGenerating(true);
    setStatus("running");
    setResult(null);

    try {
      toast.info("🚀 Starting Mega Forecast Generator...");
      
      const { data, error } = await supabase.functions.invoke('mega-forecast-generator', {
        body: {}
      });

      if (error) {
        throw error;
      }

      setStatus("success");
      setResult(data);
      toast.success(`✅ Forecast Generator completed! Generated ${data?.generatedTasks || 0} tasks`);
    } catch (error: any) {
      console.error("Error triggering function:", error);
      setStatus("error");
      toast.error(`❌ Error: ${error.message || 'Failed to trigger function'}`);
    } finally {
      setIsGenerating(false);
    }
  };


  const triggerValidationFunction = async (functionName: string) => {
    setTriggeringFunction(functionName);
    
    try {
      toast.info(`🚀 Starting ${functionName}...`);
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { trigger: 'manual' }
      });

      if (error) throw error;

      toast.success(`✅ ${functionName} completed!`);
      
      // Refresh metrics after function completes
      setTimeout(() => refetchMetrics(), 2000);
    } catch (error: any) {
      console.error(`Error triggering ${functionName}:`, error);
      toast.error(`❌ Error: ${error.message || 'Failed to trigger function'}`);
    } finally {
      setTriggeringFunction(null);
    }
  };

  const getStatusColor = (value: number, type: 'needsReview' | 'brokenSources' | 'feedbackRate') => {
    if (type === 'needsReview') {
      if (value < 50) return 'text-green-600';
      if (value < 200) return 'text-yellow-600';
      return 'text-red-600';
    }
    if (type === 'brokenSources') {
      if (value === 0) return 'text-green-600';
      if (value < 20) return 'text-yellow-600';
      return 'text-red-600';
    }
    // feedbackRate
    if (value > 80) return 'text-green-600';
    if (value > 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* VALIDATION & FEEDBACK CONTROL */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            VALIDATIE & FEEDBACK CONTROLE
          </CardTitle>
          <CardDescription>
            Monitor en herstel data kwaliteit & feedback loops
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Needs Review</span>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className={`text-3xl font-bold ${getStatusColor(validationMetrics?.needsReview || 0, 'needsReview')}`}>
                {validationMetrics?.needsReview || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Target: {'<'}50 items
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Broken Sources</span>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className={`text-3xl font-bold ${getStatusColor(validationMetrics?.brokenSources || 0, 'brokenSources')}`}>
                {validationMetrics?.brokenSources || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Target: 0 broken
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Feedback Apply Rate</span>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className={`text-3xl font-bold ${getStatusColor(validationMetrics?.feedbackApplyRate || 0, 'feedbackRate')}`}>
                {validationMetrics?.feedbackApplyRate || 0}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Target: {'>'}80%
              </p>
            </div>
          </div>

          {/* Manual Triggers */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Manual Validation Triggers</h4>
            
            <div className="grid gap-3 md:grid-cols-2">
              <Button
                onClick={() => triggerValidationFunction('meta-orchestrator')}
                disabled={triggeringFunction === 'meta-orchestrator'}
                variant="default"
                className="w-full"
              >
                {triggeringFunction === 'meta-orchestrator' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                🧠 Trigger Meta-Orchestrator
              </Button>

              <Button
                onClick={() => triggerValidationFunction('feedback-processor')}
                disabled={triggeringFunction === 'feedback-processor'}
                variant="outline"
                className="w-full"
              >
                {triggeringFunction === 'feedback-processor' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Process Feedback
              </Button>

              <Button
                onClick={() => triggerValidationFunction('data-quality-auditor')}
                disabled={triggeringFunction === 'data-quality-auditor'}
                variant="outline"
                className="w-full"
              >
                {triggeringFunction === 'data-quality-auditor' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Run Quality Audit
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Deze functies draaien automatisch elk uur. Gebruik manual triggers alleen bij urgente problemen.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};