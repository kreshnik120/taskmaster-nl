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
      {/* GUEST AI MARKTONDERZOEKER TEST */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🔬 GUEST AI MARKTONDERZOEKER - TEST NU
          </CardTitle>
          <CardDescription>
            Test de nieuwe Guest AI transformatie: van compliance expert naar marktonderzoeker
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Button
              onClick={() => triggerValidationFunction('self-trainer')}
              disabled={triggeringFunction === 'self-trainer'}
              variant="default"
              className="w-full"
              size="lg"
            >
              {triggeringFunction === 'self-trainer' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Test Self-Trainer (Markt Intel)
            </Button>

            <Button
              onClick={() => triggerValidationFunction('auto-knowledge-harvester')}
              disabled={triggeringFunction === 'auto-knowledge-harvester'}
              variant="default"
              className="w-full"
              size="lg"
            >
              {triggeringFunction === 'auto-knowledge-harvester' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Test Knowledge Harvester (Web Search)
            </Button>
          </div>

          <div className="rounded-lg bg-background/50 p-4 space-y-2 text-sm">
            <p className="font-semibold">✨ Nieuwe Focus Gebieden:</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• 🏥 <strong>GGZ Markt:</strong> Parnassia, GGZ inGeest, Altrecht - personeel, budgetten, ZZP beleid</li>
              <li>• 🏠 <strong>GHZ Markt:</strong> Prisma, Philadelphia, Lunet, Sovida - organisatiedata & externe inhuur</li>
              <li>• 👴 <strong>Ouderenzorg:</strong> Envida, Cordaan, Vitalis - marktdata & personeelsbestand</li>
              <li>• 📊 <strong>Planning Intelligence:</strong> Beschikbaarheid, certificering, locatie matching</li>
              <li>• 💰 <strong>Financiële Data:</strong> Tarieven, marktvolume, groei cijfers, personeelstekorten</li>
            </ul>
            <div className="pt-2 border-t mt-3">
              <p className="text-xs font-medium">Kwaliteitscontrole (NIEUW):</p>
              <p className="text-xs text-muted-foreground">
                ✓ Min confidence 0.85 (was 0.7) • TIER 3 bronnen REJECT • TIER 2 cross-validatie VERPLICHT
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
            
            <div className="grid gap-3 md:grid-cols-3">
              <Button
                onClick={() => triggerValidationFunction('source-fixer')}
                disabled={triggeringFunction === 'source-fixer'}
                variant="outline"
                className="w-full"
              >
                {triggeringFunction === 'source-fixer' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Fix Broken Sources
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

      {/* MEGA FORECAST GENERATOR */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            FASE 1: Mega Forecast Generator
          </CardTitle>
          <CardDescription>
            Genereer 500 forecast taken voor ABCzorg & CitoZorg verdeeld over 62 clients
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              onClick={triggerMegaForecastGenerator}
              disabled={isGenerating}
              size="lg"
              className="w-full sm:w-auto"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Genereren...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Start Forecast Generator
                </>
              )}
            </Button>
          </div>

          {status === "running" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Dit kan 30-60 seconden duren...</span>
            </div>
          )}

          {status === "success" && result && (
            <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                <div className="space-y-2 flex-1">
                  <p className="font-medium text-green-500">Forecast Generator Succesvol!</p>
                  <div className="space-y-1 text-sm">
                    <p>• Gegenereerde taken: <strong>{result.generatedTasks}</strong></p>
                    <p>• Huidige totaal: <strong>{result.currentTotal}</strong></p>
                    <p>• Target totaal: <strong>{result.targetTotal}</strong></p>
                    <p>• Batches verwerkt: <strong>{result.batchesProcessed}</strong></p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    ✅ FASE 1 Voltooid - Over 2 uur: FASE 2 (Professional Enricher + Client Intelligence)
                  </p>
                </div>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-destructive">Fout bij Forecast Generator</p>
                  <p className="text-sm text-muted-foreground">
                    Check de function logs in de Systeem tab voor meer details.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="border-t pt-4">
            <h4 className="font-medium mb-2 text-sm">Wat gebeurt er?</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• AI analyseert huidige taken & clients</li>
              <li>• Genereert realistische forecast taken voor komende weken</li>
              <li>• Verdeelt taken intelligent over 62 clients</li>
              <li>• Categoriseert per type (Regulier, Uitzendovereenkomst, etc.)</li>
              <li>• Stelt verwachte deadlines in op basis van urgentie</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};