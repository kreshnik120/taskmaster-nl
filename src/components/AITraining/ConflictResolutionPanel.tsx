import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, Trash2, XCircle, Lightbulb, Sparkles, ChevronDown } from "lucide-react";
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
  const [expandedSuggestions, setExpandedSuggestions] = useState<Record<string, boolean>>({});

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
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
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

      // Call log-conflict-resolution for AI learning
      const { data: conflict } = await supabase
        .from("business_intelligence")
        .select("*")
        .eq("id", conflictId)
        .single();

      if (conflict) {
        const conflictData = conflict.data as any;
        
        const { error: logError } = await supabase.functions.invoke(
          'log-conflict-resolution',
          {
            body: {
              user_action: resolution === 'keep_a' ? 'kept_existing' : 'accepted_new',
              conflict_type: conflictData?.conflict_type || 'value_mismatch',
              conflict_id: conflictId,
              items: [winner, loser].filter(Boolean),
              chosen_item_ids: [winner?.id].filter(Boolean),
              deleted_item_ids: [loser?.id].filter(Boolean),
              auto_resolved: false,
              ai_reasoning: conflictData?.ai_reasoning || conflict.description
            }
          }
        );

        if (logError) {
          console.error('❌ Failed to log conflict resolution:', logError);
          // Don't block - conflict is already resolved
        }
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

  const categorizeAndKeepMutation = useMutation({
    mutationFn: async ({ conflictId, winner, loser }: { conflictId: string; winner: any; loser: any }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Niet ingelogd");

      // Call AI to analyze and improve the winner item
      const { data: aiResult, error: aiError } = await supabase.functions.invoke(
        'ai-categorize-knowledge',
        {
          body: { item: winner }
        }
      );

      if (aiError) throw aiError;

      const suggestions = aiResult?.suggestions || [];
      
      // Process AI suggestions
      for (const sug of suggestions) {
        if (sug.key !== winner.key || sug.category !== winner.category) {
          // New derived item - insert
          await supabase
            .from('ai_knowledge_base')
            .insert({
              org_id: winner.org_id,
              user_id: user.id,
              category: sug.category,
              key: sug.key,
              value: sug.value,
              confidence_score: sug.confidence,
              source_type: 'ai_categorized',
              source: JSON.stringify({
                derived_from: winner.id,
                conflict_id: conflictId,
                ai_reasoning: sug.reason
              })
            });
        } else {
          // Improvement of existing item - update
          await supabase
            .from('ai_knowledge_base')
            .update({
              category: sug.category,
              value: sug.value,
              confidence_score: Math.min(1.0, (winner.confidence_score || 0.5) + 0.1)
            })
            .eq('id', winner.id);
        }
      }

      // Soft-delete loser
      if (loser) {
        await supabase
          .from("ai_knowledge_base")
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by: user.id,
            deletion_reason: {
              reason: 'conflict_resolution_with_categorization',
              conflict_id: conflictId,
              replaced_by_items: suggestions.map((s: any) => s.key)
            }
          })
          .eq("id", loser.id);
      }

      // Log the resolution
      await supabase.functions.invoke('log-conflict-resolution', {
        body: {
          user_action: 'categorized_and_kept',
          conflict_type: 'value_mismatch',
          conflict_id: conflictId,
          items: [winner, loser],
          chosen_item_ids: [winner.id],
          deleted_item_ids: [loser?.id],
          auto_resolved: false,
          ai_reasoning: `AI categorized into ${suggestions.length} items`
        }
      });

      // Resolve conflict
      await supabase
        .from("business_intelligence")
        .update({ status: "resolved" })
        .eq("id", conflictId);
    },
    onSuccess: () => {
      setLastError(null);
      toast({
        title: "Conflict opgelost en kennis gecategoriseerd",
        description: "De AI heeft de kennis geanalyseerd en verbeterd",
      });
      queryClient.invalidateQueries({ queryKey: ["conflict-resolution"] });
      queryClient.invalidateQueries({ queryKey: ["ai-knowledge"] });
      refetchStats();
    },
    onError: (error: any) => {
      const explained = explainConflictError(error, "keep_existing");
      setLastError(explained);
      toast({
        title: explained.title,
        description: explained.functionalMessage,
        variant: "destructive",
      });
    }
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
                
                // Combine conflicting_items with recommended_actions
                const conflictingItems = data?.conflicting_items || [];
                const actions = data?.recommended_actions || [];
                
                // Merge data: add action to each item
                const enrichedItems = conflictingItems.map((item: any) => {
                  const action = actions.find((a: any) => a.item_id === item.id);
                  return {
                    ...item,
                    action: action?.action || 'unknown'
                  };
                });
                
                const confidence = data?.confidence ? Math.round(data.confidence * 100) : 0;
                const keepCount = enrichedItems.filter((i: any) => i.action === 'keep').length;
                const deleteCount = enrichedItems.filter((i: any) => i.action === 'delete').length;
                const isExpanded = expandedSuggestions[suggestion.id];
                
                return (
                  <Card key={suggestion.id} className="p-4 border-l-4 border-l-blue-500">
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium">{suggestion.title || "AI Suggestie"}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {suggestion.description || "De AI stelt voor om wijzigingen door te voeren"}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <Badge variant="outline" className="whitespace-nowrap">
                            {confidence}% zekerheid
                          </Badge>
                          {confidence > 0 && (
                            <div className="flex items-center gap-2">
                              <Progress value={confidence} className="w-20 h-2" />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Reasoning */}
                      {data?.reasoning && (
                        <Alert>
                          <Sparkles className="h-4 w-4" />
                          <AlertTitle>AI Redenering</AlertTitle>
                          <AlertDescription className="text-sm mt-1">
                            {data.reasoning}
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Summary Badges */}
                      {enrichedItems.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {keepCount > 0 && (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              {keepCount} behouden
                            </Badge>
                          )}
                          {deleteCount > 0 && (
                            <Badge variant="outline" className="text-red-600 border-red-600">
                              <Trash2 className="h-3 w-3 mr-1" />
                              {deleteCount} verwijderen
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Collapsible Details */}
                      {enrichedItems.length > 0 && (
                        <Collapsible 
                          open={isExpanded}
                          onOpenChange={(open) => setExpandedSuggestions(prev => ({...prev, [suggestion.id]: open}))}
                        >
                          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:underline">
                            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            {isExpanded ? 'Details verbergen' : `Details tonen (${enrichedItems.length} items)`}
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-3">
                            <div className="space-y-2">
                              {enrichedItems.map((item: any) => (
                                <Card key={item.id} className="p-3">
                                  <div className="flex items-start gap-3">
                                    {/* Icon */}
                                    {item.action === 'delete' ? (
                                      <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                                    ) : (
                                      <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                                    )}
                                    
                                    <div className="flex-1 min-w-0">
                                      {/* Key & Action */}
                                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <span className="font-semibold text-sm break-all">{item.key}</span>
                                        <Badge variant={item.action === 'delete' ? 'destructive' : 'default'} className="shrink-0">
                                          {item.action === 'delete' ? '🗑️ Verwijderen' : '✅ Behouden'}
                                        </Badge>
                                      </div>
                                      
                                      {/* Value preview */}
                                      <div className="rounded bg-muted/50 p-2 text-xs font-mono overflow-x-auto">
                                        <pre className="whitespace-pre-wrap break-words">{JSON.stringify(item.value, null, 2)}</pre>
                                      </div>
                                      
                                      {/* Metadata */}
                                      <div className="flex gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                                        {item.confidence_score && (
                                          <span>Confidence: {Math.round(item.confidence_score * 100)}%</span>
                                        )}
                                        {item.usage_count !== undefined && (
                                          <span>Gebruikt: {item.usage_count}x</span>
                                        )}
                                        {item.created_at && (
                                          <span>Aangemaakt: {format(new Date(item.created_at), 'dd MMM yyyy', { locale: nl })}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </Card>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={() => approveSuggestionMutation.mutate({
                            suggestionId: suggestion.id,
                            actions: enrichedItems.map((item: any) => ({
                              item_id: item.id,
                              action: item.action,
                              key: item.key
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
                          variant="secondary"
                          onClick={() => categorizeAndKeepMutation.mutate({
                            conflictId: conflict.id,
                            winner: itemA,
                            loser: itemB
                          })}
                          disabled={categorizeAndKeepMutation.isPending}
                        >
                          <Sparkles className="h-4 w-4 mr-1" />
                          Categoriseer A
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
