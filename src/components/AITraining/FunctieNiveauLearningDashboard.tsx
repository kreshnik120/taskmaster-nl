import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Play, RefreshCw, Brain, TrendingUp, Clock, AlertTriangle } from "lucide-react";


interface Suggestion {
  id: string;
  key: string;
  value: {
    raw_value?: string;
    suggested_target?: string;
    target?: string;
    occurrences?: number;
    confidence?: number;
    similarity_score?: number;
  };
  confidence_score: number | null;
  requires_verification: boolean | null;
  created_at: string | null;
}

export function FunctieNiveauLearningDashboard() {
  const queryClient = useQueryClient();
  const [isTriggering, setIsTriggering] = useState(false);

  // Fetch pending suggestions
  const { data: suggestions, isLoading: loadingSuggestions } = useQuery({
    queryKey: ["functie-niveau-suggestions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_knowledge_base")
        .select("id, key, value, confidence_score, requires_verification, created_at")
        .eq("category", "functie_niveau_mapping_suggestion")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Suggestion[];
    },
  });

  // Fetch learned mappings
  const { data: learnedMappings, isLoading: loadingLearned } = useQuery({
    queryKey: ["functie-niveau-learned"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_knowledge_base")
        .select("id, key, value, confidence_score, created_at")
        .eq("category", "functie_niveau_mapping_learned")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Suggestion[];
    },
  });

  // Fetch function logs
  const { data: functionLogs } = useQuery({
    queryKey: ["functie-niveau-function-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("function_call_logs")
        .select("*")
        .in("function_name", ["learn-functie-niveau-patterns", "apply-learned-functie-niveau"])
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_knowledge_base")
        .update({
          requires_verification: false,
          confidence_score: 0.95,
          last_reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["functie-niveau-suggestions"] });
      toast.success("Suggestie goedgekeurd");
    },
    onError: () => {
      toast.error("Fout bij goedkeuren");
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_knowledge_base")
        .update({
          deleted_at: new Date().toISOString(),
          deletion_reason: { rejected: true, reason: "Manual rejection by user" },
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["functie-niveau-suggestions"] });
      toast.success("Suggestie afgewezen");
    },
    onError: () => {
      toast.error("Fout bij afwijzen");
    },
  });

  // Manual trigger
  const handleManualTrigger = async () => {
    setIsTriggering(true);
    try {
      const { error } = await supabase.functions.invoke("learn-functie-niveau-patterns");
      if (error) throw error;
      toast.success("Learning cycle gestart");
      queryClient.invalidateQueries({ queryKey: ["functie-niveau-suggestions"] });
    } catch (error) {
      toast.error("Fout bij starten learning cycle");
    } finally {
      setIsTriggering(false);
    }
  };

  const pendingReview = suggestions?.filter((s) => s.requires_verification) || [];
  const autoPromoted = learnedMappings?.length || 0;
  const lastRun = functionLogs?.[0]?.created_at;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Functie Niveau Learning Dashboard
            </CardTitle>
            <CardDescription>
              AI-gestuurde normalisatie van functieniveaus uit sollicitaties
            </CardDescription>
          </div>
          <Button onClick={handleManualTrigger} disabled={isTriggering} variant="outline" size="sm">
            {isTriggering ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Trigger Learning
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
                <p className="text-2xl font-bold">{pendingReview.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Geleerde Mappings</p>
                <p className="text-2xl font-bold">{autoPromoted}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Totaal Suggesties</p>
                <p className="text-2xl font-bold">{suggestions?.length || 0}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Laatste Run</p>
                <p className="text-lg font-medium">{lastRun ? new Date(lastRun).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" }) : "Nog niet"}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Pending Suggestions Table */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Suggesties voor Review</h3>
          {loadingSuggestions ? (
            <p className="text-muted-foreground">Laden...</p>
          ) : pendingReview.length === 0 ? (
            <p className="text-muted-foreground text-sm">Geen suggesties die review nodig hebben.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raw Value</TableHead>
                  <TableHead>Suggested Target</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Occurrences</TableHead>
                  <TableHead className="text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingReview.map((suggestion) => (
                  <TableRow key={suggestion.id}>
                    <TableCell className="font-mono text-sm">
                      {suggestion.value?.raw_value || suggestion.key}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {suggestion.value?.suggested_target || suggestion.value?.target || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          (suggestion.confidence_score || 0) >= 0.85
                            ? "default"
                            : (suggestion.confidence_score || 0) >= 0.7
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {((suggestion.confidence_score || 0) * 100).toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell>{suggestion.value?.occurrences || 1}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => approveMutation.mutate(suggestion.id)}
                        disabled={approveMutation.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => rejectMutation.mutate(suggestion.id)}
                        disabled={rejectMutation.isPending}
                      >
                        <XCircle className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Learned Mappings */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Geleerde Mappings</h3>
          {loadingLearned ? (
            <p className="text-muted-foreground">Laden...</p>
          ) : (learnedMappings?.length || 0) === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nog geen geleerde mappings. Het systeem leert automatisch dagelijks om 04:00 UTC.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {learnedMappings?.slice(0, 20).map((mapping) => (
                <Badge key={mapping.id} variant="outline" className="text-xs">
                  {mapping.value?.raw_value || mapping.key} → {mapping.value?.target}
                </Badge>
              ))}
              {(learnedMappings?.length || 0) > 20 && (
                <Badge variant="secondary">+{(learnedMappings?.length || 0) - 20} meer</Badge>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
