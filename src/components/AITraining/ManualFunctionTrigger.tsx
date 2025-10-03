import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Play, CheckCircle2, AlertCircle } from "lucide-react";

export const ManualFunctionTrigger = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [result, setResult] = useState<any>(null);

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

  return (
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
                  Check de function logs in de Monitor tab voor meer details.
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
  );
};
