import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2, Trash2, XCircle, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export const ConflictResolutionPanel = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
        .update({ status: "resolved" })
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
        .update({ status: "dismissed" })
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
        .update({ status: 'resolved' })
        .eq('id', suggestionId);
      
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast({
        title: "Suggestie goedgekeurd",
        description: "AI suggestie is geaccepteerd en uitgevoerd"
      });
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
    mutationFn: async (suggestionId: string) => {
      const { error } = await supabase
        .from('business_intelligence')
        .update({ status: 'dismissed' })
        .eq('id', suggestionId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Suggestie afgewezen",
        description: "AI suggestie is afgewezen en verwijderd"
      });
      queryClient.invalidateQueries({ queryKey: ["ai-suggestions"] });
    },
  });

  const getScoreBadge = (score: number, label: string) => {
    if (score >= 0.8) return <Badge variant="default" className="bg-green-600">{label}: {Math.round(score * 100)}%</Badge>;
    if (score >= 0.5) return <Badge variant="secondary">{label}: {Math.round(score * 100)}%</Badge>;
    return <Badge variant="outline">{label}: {Math.round(score * 100)}%</Badge>;
  };

  const getRecommendationBadge = (isRecommended: boolean) => {
    return isRecommended ? (
      <Badge variant="default" className="bg-blue-600">⭐ AI Aanbevolen</Badge>
    ) : null;
  };

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

                return (
                  <Card key={suggestion.id} className="p-4 border-blue-200 bg-blue-50 dark:bg-blue-950">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold flex items-center gap-2">
                            <Lightbulb className="h-4 w-4" />
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
                            <pre className="text-xs mt-1 overflow-x-auto">
                              {JSON.stringify(keepItem.value, null, 2).substring(0, 100)}...
                            </pre>
                          </div>
                        )}
                        
                        {deleteItems.length > 0 && (
                          <div className="bg-red-50 dark:bg-red-950 p-3 rounded border border-red-200">
                            <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2">❌ Verwijderen ({deleteItems.length}):</p>
                            {deleteItems.map((item: any, idx: number) => (
                              <p key={idx} className="text-xs font-mono">{item.key}</p>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2">
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
                          onClick={() => rejectSuggestionMutation.mutate(suggestion.id)}
                          disabled={rejectSuggestionMutation.isPending}
                        >
                          ❌ Afwijzen
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

      {/* Bestaande conflicts sectie (Tier 3) */}
      {conflicts && conflicts.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h2 className="text-2xl font-bold">Kennisconflicten ({conflicts.length})</h2>
          </div>

          <ScrollArea className="h-[600px]">
            <div className="space-y-4 pr-4">
              {conflicts.map((conflict) => {
            const conflictData = conflict.data as any;
            const items = conflictData?.conflicting_items || [];
            const aiRec = conflictData?.ai_recommendation;
            const suggestedDocs = conflictData?.suggested_documents || [];

            return (
              <Card key={conflict.id} className="p-6 border-2 border-amber-500/50">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        {conflict.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {conflict.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Gedetecteerd: {format(new Date(conflict.detected_at), "PPp", { locale: nl })}
                      </p>
                    </div>
                    <Badge variant="destructive">Prioriteit: {conflict.priority}</Badge>
                  </div>

                  {/* Conflicting Items Comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {items.map((item: any, index: number) => {
                      const isRecommended = item.id === aiRec?.recommended_id;
                      const ageInDays = item.created_at
                        ? Math.floor(
                            (Date.now() - new Date(item.created_at).getTime()) /
                              (1000 * 60 * 60 * 24)
                          )
                        : null;

                      return (
                        <Card
                          key={item.id}
                          className={`p-4 ${
                            isRecommended ? "border-2 border-blue-500" : ""
                          }`}
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between">
                              <h4 className="font-semibold text-sm">
                                Item {String.fromCharCode(65 + index)}
                              </h4>
                              {getRecommendationBadge(isRecommended)}
                            </div>

                            <div className="space-y-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Waarde:</span>
                                <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                                  {typeof item.value === "string"
                                    ? item.value
                                    : JSON.stringify(item.value, null, 2)}
                                </pre>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {getScoreBadge(item.confidence || 0.5, "Zekerheid")}
                                <Badge variant="outline">
                                  Gebruikt: {item.usage_count || 0}x
                                </Badge>
                                {ageInDays !== null && (
                                  <Badge variant="outline">
                                    {ageInDays === 0
                                      ? "Vandaag"
                                      : `${ageInDays} dag${ageInDays > 1 ? "en" : ""} oud`}
                                  </Badge>
                                )}
                              </div>

                              <div className="text-xs text-muted-foreground">
                                <p>Key: {item.key}</p>
                              </div>
                            </div>

                            <Button
                              variant="destructive"
                              size="sm"
                              className="w-full"
                              onClick={() => {
                                const keepId = items.find((i: any) => i.id !== item.id)?.id;
                                if (keepId) {
                                  resolveConflictMutation.mutate({
                                    conflictId: conflict.id,
                                    keepItemId: keepId,
                                    deleteItemIds: [item.id],
                                  });
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Verwijder dit item
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>

                  {/* AI Recommendation */}
                  {aiRec && (
                    <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-blue-600" />
                          <span className="font-semibold text-sm">AI Aanbeveling</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{aiRec.reason}</p>
                        <Button
                          variant="default"
                          size="sm"
                          className="mt-2"
                          onClick={() => {
                            const deleteIds = items
                              .filter((i: any) => i.id !== aiRec.recommended_id)
                              .map((i: any) => i.id);
                            resolveConflictMutation.mutate({
                              conflictId: conflict.id,
                              keepItemId: aiRec.recommended_id,
                              deleteItemIds: deleteIds,
                            });
                          }}
                        >
                          Accepteer AI Aanbeveling
                        </Button>
                      </div>
                    </Card>
                  )}

                  {/* Suggested Documents */}
                  {suggestedDocs.length > 0 && (
                    <Card className="p-4 bg-muted">
                      <div className="space-y-2">
                        <h5 className="font-semibold text-sm">Brondocumenten:</h5>
                        <ul className="text-sm space-y-1">
                          {suggestedDocs.map((doc: any, idx: number) => (
                            <li key={idx} className="flex items-center gap-2">
                              <span className="text-muted-foreground">•</span>
                              <span>{doc.document_name}</span>
                              <Badge variant="outline" className="text-xs">
                                {doc.kb_count} item{doc.kb_count > 1 ? "s" : ""}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </Card>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => ignoreConflictMutation.mutate(conflict.id)}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Negeren (niet een conflict)
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
