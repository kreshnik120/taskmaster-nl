import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2, Trash2, XCircle } from "lucide-react";
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
    </div>
  );
};
