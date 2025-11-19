import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, Trash2, XCircle, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { useState, useEffect } from "react";

type ConflictActionContext =
  | "keep_existing"
  | "accept_new"  
  | "ignore_conflict"
  | "mark_no_conflict"
  | "restore_item";

type FormattedConflictError = {
  context: ConflictActionContext;
  title: string;
  functionalMessage: string;
  technicalSummary: string;
  rawMessage?: string;
  code?: string;
};

function explainConflictError(error: any, context: ConflictActionContext): FormattedConflictError {
  const code = (error as any)?.code as string | undefined;
  const message = String((error as any)?.message ?? "");
  const details = String((error as any)?.details ?? "");
  const combined = `${message} ${details}`.toLowerCase();

  if (
    combined.includes("row-level security") ||
    code === "42501" ||
    combined.includes("violates row level security policy")
  ) {
    return {
      context,
      code,
      title: "Onvoldoende rechten",
      functionalMessage:
        "Je beslissing is niet opgeslagen omdat het beveiligingsbeleid (RLS) deze wijziging blokkeert.",
      technicalSummary:
        "Row Level Security policy blokkeert UPDATE. Controleer of 'Only admins can update' policy is verwijderd.",
      rawMessage: message,
    };
  }

  if (combined.includes("failed to fetch") || combined.includes("network error")) {
    return {
      context,
      code,
      title: "Backend tijdelijk niet bereikbaar",
      functionalMessage:
        "De verbinding met de backend is tijdelijk onderbroken. Probeer het over een paar seconden opnieuw.",
      technicalSummary:
        "Netwerkfout of time-out bij de API-call.",
      rawMessage: message,
    };
  }

  return {
    context,
    code,
    title: "Onverwachte fout",
    functionalMessage:
      "Er ging iets mis bij het opslaan. Probeer het opnieuw; als dit blijft gebeuren, meld het met een screenshot.",
    technicalSummary:
      "Onbekende foutcategorie. Zie rawMessage voor exacte melding.",
    rawMessage: message,
  };
}

export const ConflictResolutionPanel = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lastError, setLastError] = useState<FormattedConflictError | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [autoResolveEnabled, setAutoResolveEnabled] = useState(() => {
    const saved = localStorage.getItem('autoResolveEnabled');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('autoResolveEnabled', String(autoResolveEnabled));
  }, [autoResolveEnabled]);

  const { data: conflicts, isLoading } = useQuery({
    queryKey: ["conflict-resolution"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_intelligence")
        .select("*")
        .eq("intelligence_type", "data_quality")
        .eq("status", "active")
        .order("detected_at", { ascending: false});

      if (error) throw error;
      return data || [];
    },
  });

  const { data: suggestions } = useQuery({
    queryKey: ["ai-suggestions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_intelligence")
        .select("*")
        .eq("intelligence_type", "ai_suggestion")
        .eq("status", "active")
        .order("detected_at", { ascending: false});

      if (error) throw error;
      return data || [];
    },
  });

  const { data: autoResolveStats, refetch: refetchStats } = useQuery({
    queryKey: ["auto-resolve-stats"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from("ai_learning_events")
        .select("*")
        .eq("event_type", "conflict_resolution")
        .gte("created_at", today.toISOString());
      
      if (error) throw error;
      
      const autoResolved = data?.filter(e => {
        const context = e.context as any;
        return context?.auto_resolved === true || context?.auto_resolved === "true";
      }).length || 0;
      
      const totalResolved = data?.length || 0;
      const accuracy = totalResolved > 0 ? (autoResolved / totalResolved) * 100 : 0;
      
      return {
        autoResolved,
        totalResolved,
        accuracy: Math.round(accuracy)
      };
    },
    refetchInterval: 30000
  });

  const resolveConflictMutation = useMutation({
    mutationFn: async ({
      conflictId,
      resolution,
      winner,
      loser
    }: {
      conflictId: string;
      resolution: string;
      winner: any;
      loser: any;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Niet ingelogd");

      if (loser) {
        const { error: deleteError } = await supabase
          .from("ai_knowledge_base")
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by: user.id,
            deletion_reason: {
              reason: 'conflict_resolution',
              conflict_id: conflictId,
              winner_id: winner.id,
              resolution_action: resolution,
              deleted_by_context: 'CONFLICT_RESOLUTION'
            }
          })
          .eq("id", loser.id);

        if (deleteError) throw deleteError;
      }

      const { error: updateError } = await supabase
        .from("business_intelligence")
        .update({ 
          status: "resolved",
          last_updated_at: new Date().toISOString()
        })
        .eq("id", conflictId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      setLastError(null);
      toast({
        title: "Conflict opgelost",
        description: "Het conflict is succesvol opgelost",
      });
      queryClient.invalidateQueries({ queryKey: ["conflict-resolution"] });
      queryClient.invalidateQueries({ queryKey: ["ai-knowledge"] });
      refetchStats();
    },
    onError: (error: any) => {
      const explained = explainConflictError(error, "keep_existing");
      setLastError(explained);
      
      console.error("[ConflictResolution] resolveConflictMutation failed:", {
        context: explained.context,
        code: explained.code,
        technical: explained.technicalSummary,
        raw: explained.rawMessage,
        originalError: error,
      });
      
      toast({
        title: explained.title,
        description: explained.functionalMessage,
        variant: "destructive",
      });
    },
  });

  const approveSuggestionMutation = useMutation({
    mutationFn: async ({ suggestionId, actions }: { suggestionId: string; actions: Array<{ item_id: string; action: 'keep' | 'delete' }> }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Niet ingelogd");

      const deleteIds = actions.filter(a => a.action === 'delete').map(a => a.item_id);
      
      if (deleteIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('ai_knowledge_base')
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by: user.id,
            deletion_reason: { 
              suggestion_id: suggestionId,
              deleted_by_context: 'USER_APPROVED_AI_SUGGESTION'
            }
          })
          .in('id', deleteIds);
        
        if (deleteError) throw deleteError;
      }

      const { error: updateError } = await supabase
        .from("business_intelligence")
        .update({ 
          status: "resolved",
          last_updated_at: new Date().toISOString()
        })
        .eq("id", suggestionId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      setLastError(null);
      toast({
        title: "Suggestie goedgekeurd",
        description: "De AI-suggestie is geaccepteerd",
      });
      queryClient.invalidateQueries({ queryKey: ["ai-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["ai-knowledge"] });
    },
    onError: (error: any) => {
      const explained = explainConflictError(error, "accept_new");
      setLastError(explained);
      
      console.error("[ConflictResolution] approveSuggestionMutation failed:", {
        context: explained.context,
        code: explained.code,
        technical: explained.technicalSummary,
        raw: explained.rawMessage,
        originalError: error,
      });
      
      toast({
        title: explained.title,
        description: explained.functionalMessage,
        variant: "destructive",
      });
    },
  });

  const rejectSuggestionMutation = useMutation({
    mutationFn: async (suggestionId: string) => {
      const { error } = await supabase
        .from("business_intelligence")
        .update({ 
          status: "dismissed",
          last_updated_at: new Date().toISOString()
        })
        .eq("id", suggestionId);

      if (error) throw error;
    },
    onSuccess: () => {
      setLastError(null);
      toast({
        title: "Suggestie afgewezen",
        description: "De AI-suggestie is verworpen",
      });
      queryClient.invalidateQueries({ queryKey: ["ai-suggestions"] });
    },
    onError: (error: any) => {
      const explained = explainConflictError(error, "ignore_conflict");
      setLastError(explained);
      
      console.error("[ConflictResolution] rejectSuggestionMutation failed:", {
        context: explained.context,
        code: explained.code,
        technical: explained.technicalSummary,
        raw: explained.rawMessage,
        originalError: error,
      });
      
      toast({
        title: explained.title,
        description: explained.functionalMessage,
        variant: "destructive",
      });
    },
  });

  const markNoConflictMutation = useMutation({
    mutationFn: async (conflictId: string) => {
      const { error } = await supabase
        .from("business_intelligence")
        .update({ 
          status: "resolved",
          data: { resolution: "no_conflict_complementary" },
          last_updated_at: new Date().toISOString()
        })
        .eq("id", conflictId);

      if (error) throw error;
    },
    onSuccess: () => {
      setLastError(null);
      toast({
        title: "Geen conflict",
        description: "Items zijn gemarkeerd als complementair",
      });
      queryClient.invalidateQueries({ queryKey: ["conflict-resolution"] });
    },
    onError: (error: any) => {
      const explained = explainConflictError(error, "mark_no_conflict");
      setLastError(explained);
      
      console.error("[ConflictResolution] markNoConflictMutation failed:", {
        context: explained.context,
        code: explained.code,
        technical: explained.technicalSummary,
        raw: explained.rawMessage,
        originalError: error,
      });
      
      toast({
        title: explained.title,
        description: explained.functionalMessage,
        variant: "destructive",
      });
    },
  });

  const ignoreConflictMutation = useMutation({
    mutationFn: async (conflictId: string) => {
      const { error } = await supabase
        .from("business_intelligence")
        .update({ 
          status: "dismissed",
          last_updated_at: new Date().toISOString()
        })
        .eq("id", conflictId);

      if (error) throw error;
    },
    onSuccess: () => {
      setLastError(null);
      toast({
        title: "Conflict genegeerd",
        description: "Het conflict is verborgen",
      });
      queryClient.invalidateQueries({ queryKey: ["conflict-resolution"] });
    },
    onError: (error: any) => {
      const explained = explainConflictError(error, "ignore_conflict");
      setLastError(explained);
      
      console.error("[ConflictResolution] ignoreConflictMutation failed:", {
        context: explained.context,
        code: explained.code,
        technical: explained.technicalSummary,
        raw: explained.rawMessage,
        originalError: error,
      });
      
      toast({
        title: explained.title,
        description: explained.functionalMessage,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Conflicten laden...</div>;
  }

  const conflictArray = conflicts || [];
  const suggestionArray = suggestions || [];

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {lastError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{lastError.title}</AlertTitle>
          <AlertDescription>
            <p className="mb-1">{lastError.functionalMessage}</p>
            
            <button
              type="button"
              className="mt-1 text-xs underline hover:no-underline transition-all"
              onClick={() => setShowErrorDetails((v) => !v)}
            >
              {showErrorDetails ? "Verberg" : "Toon"} technische details
            </button>

            {showErrorDetails && (
              <div className="mt-2 rounded bg-muted/50 p-2 text-[11px] font-mono whitespace-pre-wrap">
                <div><strong>Context:</strong> {lastError.context}</div>
                {lastError.code && <div><strong>Code:</strong> {lastError.code}</div>}
                <div><strong>Samenvatting:</strong> {lastError.technicalSummary}</div>
                {lastError.rawMessage && (
                  <div className="mt-1">
                    <strong>Originele melding:</strong> {lastError.rawMessage}
                  </div>
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* AI Suggestions */}
      {suggestionArray.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            AI Suggesties ({suggestionArray.length})
          </h3>
          <ScrollArea className="max-h-[600px]">
            <div className="space-y-4">
              {suggestionArray.map((suggestion) => {
                const data = suggestion.data as any;
                const items = data?.items || [];
                
                return (
                  <Card key={suggestion.id} className="p-4 border-l-4 border-l-blue-500">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium">{suggestion.title || "AI Suggestie"}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {suggestion.description || "De AI stelt voor om wijzigingen door te voeren"}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {data?.confidence || 'N/A'}% zekerheid
                        </Badge>
                      </div>

                      {items.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {items.map((item: any, idx: number) => (
                            <div key={idx} className="p-3 rounded bg-muted/50 text-sm">
                              <div className="flex items-center gap-2">
                                {item.action === 'delete' ? (
                                  <XCircle className="h-4 w-4 text-red-500" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                )}
                                <span className="font-medium">{item.key}</span>
                              </div>
                              <div className="mt-1 text-muted-foreground">
                                {item.action === 'delete' ? 'Verwijderen' : 'Behouden'}: {JSON.stringify(item.value)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2 mt-4">
                        <Button
                          size="sm"
                          onClick={() => approveSuggestionMutation.mutate({
                            suggestionId: suggestion.id,
                            actions: items.map((item: any) => ({
                              item_id: item.id,
                              action: item.action
                            }))
                          })}
                          disabled={approveSuggestionMutation.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Goedkeuren
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => rejectSuggestionMutation.mutate(suggestion.id)}
                          disabled={rejectSuggestionMutation.isPending}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Afwijzen
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </Card>
      )}

      {/* Gedetecteerde Conflicten */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          Gedetecteerde Conflicten ({conflictArray.length})
        </h3>
        
        {conflictArray.length === 0 ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Geen actieve conflicten gevonden
            </AlertDescription>
          </Alert>
        ) : (
          <ScrollArea className="max-h-[600px]">
            <div className="space-y-4">
              {conflictArray.map((conflict) => {
                const data = conflict.data as any;
                const itemA = data?.item_a;
                const itemB = data?.item_b;
                
                return (
                  <Card key={conflict.id} className="p-4 border-l-4 border-l-red-500">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{conflict.title || "Conflict"}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {conflict.description || "Data conflict gedetecteerd"}
                          </p>
                        </div>
                        <Badge variant="destructive">{conflict.severity || "high"}</Badge>
                      </div>

                      {itemA && itemB && (
                        <div className="grid grid-cols-2 gap-4 mt-4">
                          <div className="p-3 rounded bg-muted/50">
                            <div className="font-medium text-sm mb-1">Item A</div>
                            <div className="text-xs text-muted-foreground">
                              {itemA.key}: {JSON.stringify(itemA.value)}
                            </div>
                          </div>
                          <div className="p-3 rounded bg-muted/50">
                            <div className="font-medium text-sm mb-1">Item B</div>
                            <div className="text-xs text-muted-foreground">
                              {itemB.key}: {JSON.stringify(itemB.value)}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 mt-4">
                        <Button
                          size="sm"
                          onClick={() => resolveConflictMutation.mutate({
                            conflictId: conflict.id,
                            resolution: "keep_a",
                            winner: itemA,
                            loser: itemB
                          })}
                          disabled={resolveConflictMutation.isPending}
                        >
                          Behoud A
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => resolveConflictMutation.mutate({
                            conflictId: conflict.id,
                            resolution: "keep_b",
                            winner: itemB,
                            loser: itemA
                          })}
                          disabled={resolveConflictMutation.isPending}
                        >
                          Behoud B
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markNoConflictMutation.mutate(conflict.id)}
                          disabled={markNoConflictMutation.isPending}
                        >
                          Geen Conflict
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => ignoreConflictMutation.mutate(conflict.id)}
                          disabled={ignoreConflictMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Negeren
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </Card>

      {/* Auto-Resolve Stats */}
      {autoResolveStats && autoResolveStats.totalResolved > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Vandaag automatisch opgelost</div>
              <div className="text-2xl font-bold">{autoResolveStats.autoResolved}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Nauwkeurigheid</div>
              <div className="text-2xl font-bold text-green-600">{autoResolveStats.accuracy}%</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
