import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, Trash2, XCircle, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { useState, useEffect } from "react";

export const ConflictResolutionPanel = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [autoResolvedToday, setAutoResolvedToday] = useState(0);
  // Lees initiële waarde uit localStorage, default = true
  const [autoResolveEnabled, setAutoResolveEnabled] = useState(() => {
    const saved = localStorage.getItem('autoResolveEnabled');
    return saved !== null ? saved === 'true' : true;
  });

  // Sla toggle status op in localStorage bij elke wijziging
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
        .order("detected_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Query voor AI-deleted items (laatste 30 dagen)
  const { data: deletedItems } = useQuery({
    queryKey: ["ai-deleted-items"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from("ai_knowledge_base")
        .select("*")
        .eq("deleted_by", "AI_AUTO_RESOLVE")
        .gte("deleted_at", thirtyDaysAgo)
        .order("deleted_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // SPRINT 2: Query voor AI suggestions (Tier 2: 70-94% confidence)
  const { data: suggestions } = useQuery({
    queryKey: ["ai-suggestions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_intelligence")
        .select("*")
        .eq("intelligence_type", "ai_suggestion")
        .eq("status", "active")
        .order("detected_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Query voor auto-resolve statistics (persistent data uit database)
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
    refetchInterval: 30000 // Refresh elke 30 seconden
  });

  const resolveConflictMutation = useMutation({
    mutationFn: async ({
      conflictId,
      keepItemId,
      deleteItemIds,
    }: {
      conflictId: string;
      keepItemId: string;
      deleteItemIds: string[];
    }) => {
      // Delete conflicting items
      const { error: deleteError } = await supabase
        .from("ai_knowledge_base")
        .delete()
        .in("id", deleteItemIds);

      if (deleteError) throw deleteError;

      // Mark conflict as resolved
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
      toast({
        title: "Conflict opgelost",
        description: "Conflicterende items zijn verwijderd",
      });
      queryClient.invalidateQueries({ queryKey: ["conflict-resolution"] });
      queryClient.invalidateQueries({ queryKey: ["ai-knowledge"] });
    },
    onError: (error: any) => {
      toast({
        title: "Fout bij oplossen conflict",
        description: error.message,
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
      toast({
        title: "Conflict genegeerd",
        description: "Dit conflict wordt niet meer getoond",
      });
      queryClient.invalidateQueries({ queryKey: ["conflict-resolution"] });
    },
  });

  const noConflictMutation = useMutation({
    mutationFn: async ({ conflictId, isAutoResolved = false }: { conflictId: string; isAutoResolved?: boolean }) => {
      const { error } = await supabase
        .from("business_intelligence")
        .update({ 
          status: "no_conflict",
          last_updated_at: new Date().toISOString()
        })
        .eq("id", conflictId);

      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      const { conflictId, isAutoResolved = false } = variables;
      
      toast({
        title: "Geen conflict",
        description: "Beide items worden behouden - geen echt conflict",
      });
      
      // Check if this was auto-resolved
      const conflict = [...(conflicts || []), ...(suggestions || [])].find((c: any) => c.id === conflictId);
      if (conflict) {
        const conflictData = conflict.data as any;
        const reasoning = conflictData?.ai_reasoning || conflictData?.reasoning || "";
        
        await supabase.functions.invoke('log-conflict-resolution', {
          body: {
            user_action: 'marked_as_complementary',
            conflict_type: conflict.intelligence_type,
            conflict_id: conflictId,
            ai_reasoning: reasoning,
            items: conflictData?.conflicting_items || conflictData?.suggested_actions,
            auto_resolved: isAutoResolved,
            learning_score: isAutoResolved ? 1.0 : 0.95,
          }
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ["conflict-resolution"] });
      queryClient.invalidateQueries({ queryKey: ["ai-suggestions"] });
    },
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("ai_knowledge_base")
        .update({
          deleted_at: null,
          deleted_by: null,
          deletion_reason: null,
        })
        .eq("id", itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Item hersteld",
        description: "Knowledge item is succesvol teruggedraaid",
      });
      queryClient.invalidateQueries({ queryKey: ["ai-deleted-items"] });
      queryClient.invalidateQueries({ queryKey: ["ai-knowledge"] });
    },
    onError: (error: any) => {
      toast({
        title: "Fout bij herstellen",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // SPRINT 2: Approve AI suggestion mutation
  const approveSuggestionMutation = useMutation({
    mutationFn: async ({ suggestionId, actions }: { 
      suggestionId: string; 
      actions: Array<{ item_id: string; action: 'keep' | 'delete' }>;
    }) => {
      const deleteIds = actions.filter(a => a.action === 'delete').map(a => a.item_id);
      
      // Soft delete losers
      if (deleteIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('ai_knowledge_base')
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by: 'USER_APPROVED_AI_SUGGESTION',
            deletion_reason: { suggestion_id: suggestionId }
          })
          .in('id', deleteIds);
        
        if (deleteError) throw deleteError;
      }
      
      // Mark suggestion as resolved
      const { error: updateError } = await supabase
        .from('business_intelligence')
        .update({ 
          status: 'resolved',
          last_updated_at: new Date().toISOString()
        })
        .eq('id', suggestionId);
      
      if (updateError) throw updateError;
    },
    onSuccess: async (data, variables) => {
      toast({
        title: "Suggestie goedgekeurd",
        description: "AI suggestie is geaccepteerd en uitgevoerd"
      });
      
      // Log to continuous learner
      const suggestion = suggestions?.find((s: any) => s.id === variables.suggestionId);
      if (suggestion) {
        await supabase.functions.invoke('log-conflict-resolution', {
          body: {
            user_action: 'approved',
            conflict_type: 'ai_suggestion',
            suggestion_id: variables.suggestionId,
            suggestion_data: suggestion.data,
            items_affected: variables.actions,
            chosen_item_ids: variables.actions.filter((a: any) => a.action === 'keep').map((a: any) => a.item_id),
            deleted_item_ids: variables.actions.filter((a: any) => a.action === 'delete').map((a: any) => a.item_id),
          }
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ["ai-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["ai-knowledge"] });
      queryClient.invalidateQueries({ queryKey: ["ai-deleted-items"] });
    },
    onError: (error: any) => {
      toast({
        title: "Fout bij goedkeuren",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // SPRINT 2: Reject AI suggestion mutation
  const rejectSuggestionMutation = useMutation({
    mutationFn: async ({ suggestionId, isAutoResolved = false }: { 
      suggestionId: string; 
      isAutoResolved?: boolean 
    }) => {
      const { error } = await supabase
        .from('business_intelligence')
        .update({ 
          status: 'dismissed',
          last_updated_at: new Date().toISOString()
        })
        .eq('id', suggestionId);
      
      if (error) throw error;
    },
    onSuccess: async (data, variables) => {
      const { suggestionId, isAutoResolved } = variables;
      toast({
        title: "Suggestie afgewezen",
        description: "AI suggestie is afgewezen en verwijderd"
      });
      
      // Log rejection als negatieve feedback
      const suggestion = suggestions?.find((s: any) => s.id === suggestionId);
      if (suggestion) {
        const suggestionData = suggestion.data as any;
      await supabase.functions.invoke('log-conflict-resolution', {
        body: {
          user_action: 'rejected',
          conflict_type: 'ai_suggestion',
          suggestion_id: suggestionId,
          suggestion_data: suggestion.data,
          items_affected: suggestionData?.suggested_actions,
          auto_resolved: isAutoResolved,
          learning_score: isAutoResolved ? 1.0 : 0.0,
        }
      });
      }
      
      queryClient.invalidateQueries({ queryKey: ["ai-suggestions"] });
    },
  });

  const getScoreBadge = (score: number, label: string) => {
    if (score >= 0.8) return <Badge variant="default" className="bg-green-600">{label}: {Math.round(score * 100)}%</Badge>;
    if (score >= 0.5) return <Badge variant="secondary">{label}: {Math.round(score * 100)}%</Badge>;
    return <Badge variant="outline">{label}: {Math.round(score * 100)}%</Badge>;
  };

  const isComplementaryConflict = (reasoning: string) => {
    const keywords = [
      "geen sprake van een conflict",
      "complementaire",
      "complementair",
      "aanvullend",
      "aanvult",
      "geen conflict in de inhoud",
      "verschillend maar beide correct",
      "beide items zijn betrouwbaar",
      "beide behouden",
      "geen conflict",
      "beide correct",
      "beide juist",
      "geen tegenstrijdigheid"
    ];
    return keywords.some(keyword => reasoning.toLowerCase().includes(keyword.toLowerCase()));
  };

  // Check if AI suggestion only advises keeping items (= no real conflict)
  const isKeepOnlySuggestion = (suggestionData: any) => {
    const actions = suggestionData?.suggested_actions || [];
    if (actions.length === 0) return false;
    return actions.every((action: any) => action.action === 'keep');
  };

  const truncateJson = (obj: any, maxLength = 100) => {
    const str = JSON.stringify(obj, null, 2);
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + "...";
  };

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  
  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Auto-resolve complementary conflicts with batch processing
  useEffect(() => {
    if (!autoResolveEnabled) return;
    
    const processAutoResolve = async () => {
      const maxIterations = 5;
      const batchSize = 25;
      const pauseBetweenBatches = 1000; // 1 second
      
      let iteration = 0;
      let totalProcessed = 0;
      
      while (iteration < maxIterations) {
        // Combineer conflicts en suggestions
        const allItems = [
          ...(conflicts || []).map((c: any) => ({ ...c, type: 'conflict' })),
          ...(suggestions || []).map((s: any) => ({ ...s, type: 'suggestion' }))
        ];
        
        if (allItems.length === 0) break;
        
        // Filter complementary items met uitgebreide checks
        const complementaryItems = allItems.filter((item: any) => {
          const itemData = item.data as any;
          const reasoning = itemData?.ai_reasoning || itemData?.reasoning || "";
          
          // Check 1: Keywords in reasoning
          const hasKeyword = isComplementaryConflict(reasoning);
          
          // Check 2: Voor suggestions - check of alleen "keep" acties
          const isKeepOnly = item.type === 'suggestion' && isKeepOnlySuggestion(itemData);
          
          return hasKeyword || isKeepOnly;
        });
        
        if (complementaryItems.length === 0) break;
        
        const toResolve = complementaryItems.slice(0, batchSize);
        
        console.log(`🤖 [Auto-Resolve Batch ${iteration + 1}/${maxIterations}] Processing ${toResolve.length} items (${toResolve.filter(i => i.type === 'conflict').length} conflicts, ${toResolve.filter(i => i.type === 'suggestion').length} suggestions)`);
        
        // Resolve each with correct mutation based on type
        toResolve.forEach((item: any) => {
          if (item.type === 'conflict') {
            noConflictMutation.mutate({ conflictId: item.id, isAutoResolved: true });
          } else {
            rejectSuggestionMutation.mutate({ suggestionId: item.id, isAutoResolved: true });
          }
        });
        
        totalProcessed += toResolve.length;
        iteration++;
        
        // Als er meer items zijn, wacht dan kort en herhaal
        if (complementaryItems.length > batchSize && iteration < maxIterations) {
          await new Promise(resolve => setTimeout(resolve, pauseBetweenBatches));
        } else {
          break;
        }
      }
      
      if (totalProcessed > 0) {
        console.log(`✅ [Auto-Resolve Complete] ${totalProcessed} items processed in ${iteration} batch(es)`);
        setAutoResolvedToday(prev => prev + totalProcessed);
        
        toast({
          title: "🤖 Auto-Resolve Compleet",
          description: `${totalProcessed} complementaire items verwerkt in ${iteration} batch(es)`,
        });
        
        // Update last run timestamp in localStorage
        localStorage.setItem('autoResolveLastRun', new Date().toISOString());
        
        // Refresh statistics na auto-resolve
        setTimeout(() => {
          refetchStats?.();
        }, 1500);
      }
    };
    
    processAutoResolve();
  }, [conflicts, suggestions, autoResolveEnabled]);

  if (isLoading) {
    return <div className="text-center py-8">Laden...</div>;
  }

  if (!conflicts || conflicts.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-600" />
          <p className="text-lg font-medium">Geen conflicten gedetecteerd</p>
          <p className="text-sm mt-2">Alle kennisitems zijn consistent</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Auto-Resolve Control - ALTIJD ZICHTBAAR */}
      <Card className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Lightbulb className="h-6 w-6 text-blue-600" />
            <div>
              <h3 className="font-semibold text-lg">Auto-Resolve Systeem</h3>
              <p className="text-sm text-muted-foreground">
                Automatische afhandeling van complementaire kennisitems
              </p>
              {(() => {
                const lastRun = localStorage.getItem('autoResolveLastRun');
                if (lastRun) {
                  const date = new Date(lastRun);
                  const timeAgo = Math.floor((Date.now() - date.getTime()) / 60000);
                  return (
                    <p className="text-xs text-blue-600 mt-1">
                      Laatste run: {timeAgo < 1 ? 'zojuist' : `${timeAgo} min geleden`}
                    </p>
                  );
                }
                return null;
              })()}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Real-time statistics uit database */}
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">
                {autoResolveStats?.autoResolved || 0}
              </div>
              <div className="text-xs text-muted-foreground">vandaag verwerkt</div>
            </div>
            
            {/* Toggle button - werkt met bestaande state */}
            <Button
              variant={autoResolveEnabled ? "default" : "outline"}
              onClick={() => setAutoResolveEnabled(!autoResolveEnabled)}
              className="min-w-[100px]"
            >
              {autoResolveEnabled ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  AAN
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  UIT
                </>
              )}
            </Button>
          </div>
        </div>
        
        {/* Uitgebreide statistics - alleen tonen als er data is */}
        {autoResolveStats && autoResolveStats.totalResolved > 0 && (
          <div className="grid grid-cols-3 gap-4 pt-4 border-t mt-4">
            <div>
              <div className="text-sm text-muted-foreground">Totaal Verwerkt</div>
              <div className="text-xl font-semibold">{autoResolveStats.totalResolved}</div>
              <div className="text-xs text-muted-foreground mt-1">Vandaag</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Automatisch</div>
              <div className="text-xl font-semibold text-blue-600">
                {autoResolveStats.autoResolved}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Door AI afgehandeld
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">AI Accuracy</div>
              <div className="text-xl font-semibold text-green-600">
                {autoResolveStats.accuracy}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Succesvolle beslissingen
              </div>
            </div>
          </div>
        )}
        
        {/* Hulptekst */}
        <div className="mt-4 p-3 bg-blue-100 dark:bg-blue-950/30 rounded-lg">
          <p className="text-xs text-muted-foreground">
            💡 <strong>Hoe werkt het?</strong> Auto-Resolve detecteert automatisch wanneer conflicterende items 
            <strong>complementair</strong> zijn (elkaar aanvullen) en markeert ze als "Geen Conflict". 
            Items met redenering zoals "vullen elkaar aan" worden automatisch verwerkt.
          </p>
        </div>
      </Card>

      {/* SPRINT 2: AI Suggestions (Tier 2) */}
      {suggestions && suggestions.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-blue-500" />
            <h2 className="text-2xl font-bold">AI Suggesties ({suggestions.length})</h2>
          </div>
          
          <ScrollArea className="h-[400px]">
            <div className="space-y-3 pr-4">
              {suggestions.map((suggestion: any) => {
                const data = suggestion.data as any;
                const conflictingItems = data?.conflicting_items || [];
                const actions = data?.recommended_actions || [];
                const keepItem = conflictingItems.find((item: any) => 
                  actions.find((a: any) => a.item_id === item.id && a.action === 'keep')
                );
                const deleteItems = conflictingItems.filter((item: any) => 
                  actions.find((a: any) => a.item_id === item.id && a.action === 'delete')
                );
                const aiReasoning = data?.reasoning || "";
                const isComplementary = isComplementaryConflict(aiReasoning);

                return (
                  <Card key={suggestion.id} className={`p-4 ${isComplementary ? 'border-green-500/50 bg-green-50 dark:bg-green-950/20' : 'border-blue-200 bg-blue-50 dark:bg-blue-950'}`}>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold flex items-center gap-2">
                            {isComplementary ? '🤝' : <Lightbulb className="h-4 w-4" />}
                            {suggestion.title}
                          </h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {suggestion.description}
                          </p>
                          <Badge variant="outline" className="mt-2">
                            {(data.confidence * 100).toFixed(0)}% zekerheid
                          </Badge>
                        </div>
                      </div>

                      {data.reasoning && (
                        <div className="text-sm bg-white dark:bg-gray-900 p-3 rounded border">
                          <p className="font-medium text-xs text-muted-foreground mb-1">AI Redenering:</p>
                          <p className="italic">"{data.reasoning}"</p>
                        </div>
                      )}

                      {/* Show what will be kept vs deleted */}
                      <div className="grid grid-cols-2 gap-3">
                        {keepItem && (
                          <div className="bg-green-50 dark:bg-green-950 p-3 rounded border border-green-200">
                            <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-2">✅ Behouden:</p>
                            <p className="text-xs font-mono">{keepItem.key}</p>
                            <div className={`text-xs mt-1 whitespace-pre-wrap break-words ${!expandedItems[`sugg-keep-${suggestion.id}`] ? 'max-h-20 overflow-hidden' : 'max-h-60 overflow-y-auto'}`}>
                              {expandedItems[`sugg-keep-${suggestion.id}`] 
                                ? JSON.stringify(keepItem.value, null, 2)
                                : JSON.stringify(keepItem.value, null, 2).substring(0, 100) + '...'}
                            </div>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-xs"
                              onClick={() => toggleExpand(`sugg-keep-${suggestion.id}`)}
                            >
                              {expandedItems[`sugg-keep-${suggestion.id}`] ? '▲ Toon minder' : '▼ Toon meer'}
                            </Button>
                          </div>
                        )}
                        
                        {deleteItems.length > 0 && (
                          <div className="bg-red-50 dark:bg-red-950 p-3 rounded border border-red-200">
                            <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2">❌ Verwijderen ({deleteItems.length}):</p>
                            {deleteItems.map((item: any, idx: number) => (
                              <div key={idx}>
                                <p className="text-xs font-mono">{item.key}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2">
                        {!isComplementary && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => approveSuggestionMutation.mutate({
                                suggestionId: suggestion.id,
                                actions: data.recommended_actions
                              })}
                              disabled={approveSuggestionMutation.isPending}
                            >
                              ✅ Goedkeuren
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => rejectSuggestionMutation.mutate({ suggestionId: suggestion.id, isAutoResolved: false })}
                              disabled={rejectSuggestionMutation.isPending}
                            >
                              ❌ Afwijzen
                            </Button>
                          </>
                        )}
                        <Button
                          variant={isComplementary ? "default" : "outline"}
                          size="sm"
                          className={isComplementary ? "bg-green-600 hover:bg-green-700" : ""}
                          onClick={() => noConflictMutation.mutate({ 
                            conflictId: suggestion.id, 
                            isAutoResolved: false 
                          })}
                          disabled={noConflictMutation.isPending}
                        >
                          🤝 Geen Conflict
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </>
      )}

      {/* Kennisconflicten sectie (Tier 3) - Verbeterde presentatie */}
      {conflicts && conflicts.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h2 className="text-2xl font-bold">Kennisconflicten ({conflicts.length})</h2>
          </div>

          <ScrollArea className="h-[600px]">
            <div className="space-y-3 pr-4">
              {conflicts.map((conflict) => {
            const conflictData = conflict.data as any;
            const items = conflictData?.conflicting_items || [];
            const aiReasoning = conflictData?.ai_reasoning || conflictData?.reasoning || "";
            const isComplementary = isComplementaryConflict(aiReasoning);

            return (
              <Card key={conflict.id} className={`p-4 ${isComplementary ? 'border-green-500/50 bg-green-50 dark:bg-green-950/20' : 'border-blue-200 bg-blue-50 dark:bg-blue-950'}`}>
                <div className="space-y-3">
                  {/* Header - Compact */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold flex items-center gap-2">
                        {isComplementary ? '🤝' : <Lightbulb className="h-4 w-4" />}
                        {conflict.title}
                      </h4>
                      {conflict.description && (
                        <p className="text-sm text-muted-foreground mt-1">{conflict.description}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="ml-2">
                      {conflict.priority}
                    </Badge>
                  </div>

                  {/* High Confidence Hint */}
                  {items.every((item: any) => item.confidence >= 0.95) && (
                    <Alert className="border-green-500 bg-green-50 dark:bg-green-950/30">
                      <Lightbulb className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-sm">
                        💡 <strong>Beide items hebben hoge kwaliteit (≥95%).</strong>
                        <br />
                        Overweeg <strong>"Geen Conflict"</strong> als ze elkaar aanvullen in plaats van tegenspreken.
                        <br />
                        <span className="text-xs text-muted-foreground">
                          Tip: Kijk naar de bron en datum om de meest actuele te kiezen, of behoud beide als ze complementair zijn.
                        </span>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* AI Redenering */}
                  {aiReasoning && (
                    <div className="rounded-lg p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200">
                      <div className="flex items-start gap-2">
                        <Lightbulb className="h-4 w-4 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-muted-foreground mb-1">AI Redenering:</p>
                          <p className="text-sm italic">"{aiReasoning}"</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Conflicterende Items - Compacte lijst */}
                  <div className="space-y-2">
                    {items.map((item: any, idx: number) => {
                      const aiRec = conflictData?.ai_recommendation;
                      const isRecommended = item.id === aiRec?.recommended_id;
                      const itemExpandKey = `conflict-${conflict.id}-item-${item.id}`;
                      return (
                        <div key={item.id} className="flex items-start gap-2 text-sm">
                          <span className="font-medium min-w-[60px]">Item {String.fromCharCode(65 + idx)}:</span>
                          <div className="flex-1">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {getScoreBadge(item.confidence || 0.5, "Z")}
                                
                                {item.value?.source_type && (
                                  <Badge variant="secondary" className="text-xs">
                                    {item.value.source_type === 'tier1_officieel' && '🏛️ Officieel'}
                                    {item.value.source_type === 'tier2_branche' && '🏢 Branche'}
                                    {item.value.source_type?.includes('tier3') && '📚 Intern'}
                                    {!item.value.source_type.includes('tier') && item.value.source_type}
                                  </Badge>
                                )}
                                
                                <span className="text-xs text-muted-foreground">
                                  {new Date(item.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                                
                                <Badge variant="outline" className="text-xs">{item.usage_count || 0}x gebruikt</Badge>
                                
                                {isRecommended && <Badge className="text-xs bg-blue-600">⭐ AI keuze</Badge>}
                              </div>
                              
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="text-xs">{item.category}</Badge>
                                <span>→</span>
                                <span className="font-mono">{item.key}</span>
                              </div>
                            </div>
                            <div className={`text-xs bg-muted/30 rounded p-2 font-mono whitespace-pre-wrap break-words ${!expandedItems[itemExpandKey] ? 'max-h-20 overflow-hidden' : 'max-h-60 overflow-y-auto'}`}>
                              {expandedItems[itemExpandKey] 
                                ? JSON.stringify(item.value, null, 2)
                                : truncateJson(item.value, 100)}
                            </div>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-xs"
                              onClick={() => toggleExpand(itemExpandKey)}
                            >
                              {expandedItems[itemExpandKey] ? '▲ Toon minder' : '▼ Toon meer'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    {!isComplementary && (
                      <>
                        {items.slice(0, 2).map((item: any, idx: number) => (
                          <Button
                            key={item.id}
                            size="sm"
                            onClick={() => {
                              const otherItems = items.filter((i: any) => i.id !== item.id);
                              resolveConflictMutation.mutate({
                                conflictId: conflict.id,
                                keepItemId: item.id,
                                deleteItemIds: otherItems.map((i: any) => i.id),
                              });
                            }}
                            disabled={resolveConflictMutation.isPending}
                          >
                            ✅ Behoud {String.fromCharCode(65 + idx)}
                          </Button>
                        ))}
                      </>
                    )}
                    <Button
                      variant={isComplementary ? "default" : "outline"}
                      size="sm"
                      className={isComplementary ? "bg-green-600 hover:bg-green-700" : ""}
                      onClick={() => noConflictMutation.mutate({ conflictId: conflict.id, isAutoResolved: false })}
                      disabled={noConflictMutation.isPending}
                    >
                      🤝 Geen Conflict
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => ignoreConflictMutation.mutate(conflict.id)}
                      disabled={ignoreConflictMutation.isPending}
                    >
                      ⏩ Negeren
                    </Button>
                  </div>
                </div>
              </Card>
            );
              })}
            </div>
          </ScrollArea>
        </>
      )}

      {/* NIEUWE SECTIE: AI-verwijderde items */}
      {deletedItems && deletedItems.length > 0 && (
        <>
          <div className="flex items-center gap-2 mt-8">
            <XCircle className="h-5 w-5 text-blue-500" />
            <h2 className="text-2xl font-bold">Recent verwijderd door AI ({deletedItems.length})</h2>
          </div>

          <ScrollArea className="h-[400px]">
            <div className="space-y-3 pr-4">
              {deletedItems.map((item: any) => {
                const reason = item.deletion_reason as any;
                const daysLeft = Math.ceil(
                  (30 - (Date.now() - new Date(item.deleted_at).getTime()) / (1000 * 60 * 60 * 24))
                );

                return (
                  <Card key={item.id} className="p-4 border-blue-200 bg-blue-50 dark:bg-blue-950">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm">{item.key}</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            Verwijderd: {format(new Date(item.deleted_at), "PPp", { locale: nl })}
                          </p>
                          <Badge variant="outline" className="mt-2">
                            Nog {daysLeft} dagen beschikbaar
                          </Badge>
                        </div>
                      </div>

                      {reason && (
                        <div className="text-sm">
                          <p className="text-muted-foreground">Reden: {reason.reason}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Zekerheid: {(reason.confidence * 100).toFixed(0)}%
                          </p>
                        </div>
                      )}

                      <div className="text-xs bg-muted p-2 rounded">
                        <span className="text-muted-foreground">Waarde:</span>
                        <pre className="mt-1 overflow-x-auto">
                          {typeof item.value === "string"
                            ? item.value
                            : JSON.stringify(item.value, null, 2)}
                        </pre>
                      </div>

                      <Button
                        variant="default"
                        size="sm"
                        className="w-full"
                        onClick={() => restoreMutation.mutate(item.id)}
                      >
                        ↩️ Terugdraaien
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
};
