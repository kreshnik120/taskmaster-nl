import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Zap, CheckCircle2, AlertTriangle, TrendingUp } from "lucide-react";
import { useState } from "react";

export const IntelligentConflictDashboard = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);

  const { data: lastRun } = useQuery({
    queryKey: ["last-conflict-resolution"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("function_call_logs")
        .select("*")
        .eq("function_name", "intelligent-conflict-resolver")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
  });

  const { data: autoCorrections } = useQuery({
    queryKey: ["auto-corrections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_intelligence")
        .select("*")
        .eq("intelligence_type", "auto_correction")
        .order("detected_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
  });

  const runConflictResolver = useMutation({
    mutationFn: async () => {
      setIsRunning(true);
      const { data, error } = await supabase.functions.invoke(
        "intelligent-conflict-resolver"
      );

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["last-conflict-resolution"] });
      queryClient.invalidateQueries({ queryKey: ["auto-corrections"] });
      queryClient.invalidateQueries({ queryKey: ["conflict-resolution"] });
      
      toast({
        title: "✅ Conflict resolution voltooid",
        description: `${data.summary.auto_resolved} conflicten automatisch opgelost, ${data.summary.manual_review_needed} wachten op review`,
      });
      setIsRunning(false);
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Fout bij conflict resolution",
        description: error.message,
        variant: "destructive",
      });
      setIsRunning(false);
    },
  });

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Intelligent Conflict Resolution
              </CardTitle>
              <CardDescription>
                Automatische detectie en oplossing van data conflicten tussen org_profiles en ai_knowledge_base
              </CardDescription>
            </div>
            <Button
              onClick={() => runConflictResolver.mutate()}
              disabled={isRunning}
              size="lg"
              className="gap-2"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Run Scan
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Laatste scan</div>
              <div className="text-2xl font-bold">
                {lastRun ? new Date(lastRun.created_at).toLocaleTimeString('nl-NL') : 'Nog niet uitgevoerd'}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Execution tijd</div>
              <div className="text-2xl font-bold">
                {lastRun?.execution_time_ms ? `${lastRun.execution_time_ms}ms` : '-'}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Status</div>
              <div className="flex items-center gap-2">
                {lastRun?.success ? (
                  <Badge variant="outline" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Success
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Error
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {autoCorrections && autoCorrections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Recente Auto-correcties
            </CardTitle>
            <CardDescription>
              Automatisch opgeloste conflicten op basis van confidence scores
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {autoCorrections.map((correction) => {
                const data = correction.data as any;
                return (
                  <div
                    key={correction.id}
                    className="flex items-start justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="space-y-1">
                      <div className="font-medium">{correction.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {data.brand_name} - {data.field}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">
                          {data.old_value} → {data.new_value}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="outline" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Auto-opgelost
                      </Badge>
                      <div className="text-xs text-muted-foreground">
                        {new Date(correction.detected_at).toLocaleString('nl-NL')}
                      </div>
                      <div className="text-xs font-medium text-primary">
                        Confidence: {((data.confidence || 0) * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle>Hoe werkt het?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-3">
            <div className="font-bold text-primary">1.</div>
            <div>
              <strong>Detectie:</strong> Scant org_profiles en vergelijkt met ai_knowledge_base voor tegenstrijdigheden
            </div>
          </div>
          <div className="flex gap-3">
            <div className="font-bold text-primary">2.</div>
            <div>
              <strong>Analyse:</strong> Beoordeelt confidence scores, usage counts en last verified dates
            </div>
          </div>
          <div className="flex gap-3">
            <div className="font-bold text-primary">3.</div>
            <div>
              <strong>Auto-resolve criteria:</strong>
              <ul className="mt-1 ml-4 list-disc">
                <li>Confidence &gt;95% + 5+ uses, OF</li>
                <li>Confidence &gt;85% + 10+ uses</li>
              </ul>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="font-bold text-primary">4.</div>
            <div>
              <strong>Manual review:</strong> Conflicten onder drempelwaarden worden gelogd voor handmatige verificatie
            </div>
          </div>
          <div className="flex gap-3">
            <div className="font-bold text-primary">5.</div>
            <div>
              <strong>Logging:</strong> Alle acties worden gelogd in business_intelligence en ai_learning_events
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
