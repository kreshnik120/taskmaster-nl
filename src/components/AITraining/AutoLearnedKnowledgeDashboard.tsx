import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle, Eye, Edit, TrendingUp, Calendar, AlertCircle, XCircle, Scan, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

interface AutoLearnedItem {
  id: string;
  category: string;
  key: string;
  value: any;
  stability_score: number;
  requires_verification: boolean;
  confidence_score: number;
  correction_count: number;
  created_at: string;
  validation_status: string;
  source_reference: string;
}

interface OutdatedItem {
  id: string;
  key: string;
  category: string;
  reason: string;
  confidence: number;
}

export const AutoLearnedKnowledgeDashboard = () => {
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState<string>("recent");
  const [showUnverifiedOnly, setShowUnverifiedOnly] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AutoLearnedItem | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [outdatedItems, setOutdatedItems] = useState<OutdatedItem[]>([]);

  // Fetch auto-learned knowledge items
  const { data: items = [], refetch } = useQuery({
    queryKey: ["auto-learned-knowledge", sortBy, showUnverifiedOnly],
    queryFn: async () => {
      let query = supabase
        .from("ai_knowledge_base")
        .select("*")
        .ilike("source_reference", "%continuous-learner%")
        .is("deleted_at", null);

      if (showUnverifiedOnly) {
        query = query.eq("requires_verification", true);
      }

      // Apply sorting
      switch (sortBy) {
        case "recent":
          query = query.order("created_at", { ascending: false });
          break;
        case "stability-low":
          query = query.order("stability_score", { ascending: true });
          break;
        case "confidence-high":
          query = query.order("confidence_score", { ascending: false });
          break;
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data as AutoLearnedItem[];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    refetchIntervalInBackground: false,
  });

  // Calculate stats
  const stats = {
    total: items.length,
    unverified: items.filter(i => i.requires_verification).length,
    avgStability: items.length > 0 
      ? (items.reduce((sum, i) => sum + (i.stability_score || 0), 0) / items.length).toFixed(2)
      : "0.00",
    avgConfidence: items.length > 0
      ? Math.round((items.reduce((sum, i) => sum + (i.confidence_score || 0), 0) / items.length) * 100)
      : 0,
    totalCorrections: items.reduce((sum, i) => sum + (i.correction_count || 0), 0),
    todayCount: items.filter(i => {
      const today = new Date();
      const itemDate = new Date(i.created_at);
      return itemDate.toDateString() === today.toDateString();
    }).length,
  };

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("auto-learned-knowledge")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ai_knowledge_base",
          filter: "source_reference=ilike.%continuous-learner%",
        },
        (payload) => {
          logger.log("🆕 New auto-learned knowledge!", payload);
          queryClient.invalidateQueries({ queryKey: ["auto-learned-knowledge"] });
          toast.success("Nieuwe kennis geleerd! 🎓", {
            description: `${payload.new.key} (${payload.new.category})`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const verifyItem = async (id: string) => {
    const { error } = await supabase
      .from("ai_knowledge_base")
      .update({
        requires_verification: false,
        validation_status: "verified",
        last_verified: new Date().toISOString(),
        stability_score: 1.0,
      })
      .eq("id", id);

    if (error) {
      toast.error("Verificatie mislukt", {
        description: error.message,
      });
      return;
    }

    toast.success("✓ Item geverifieerd!");
    setSelectedItem(null);
    refetch();
  };

  const rejectItem = async (id: string, reason: string = "Verouderd of onjuist") => {
    const { error } = await supabase
      .from("ai_knowledge_base")
      .update({
        requires_verification: false,
        validation_status: "rejected",
        last_verified: new Date().toISOString(),
        stability_score: 0.0,
        deletion_reason: { reason, rejected_at: new Date().toISOString() },
      })
      .eq("id", id);

    if (error) {
      toast.error("Afwijzing mislukt", {
        description: error.message,
      });
      return;
    }

    toast.success("✗ Item afgewezen!");
    setSelectedItem(null);
    refetch();
  };

  const scanOutdatedKnowledge = async () => {
    setIsScanning(true);
    setOutdatedItems([]);

    try {
      const { data, error } = await supabase.functions.invoke("scan-outdated-knowledge", {
        body: {},
      });

      if (error) throw error;

      if (data.outdated && data.outdated.length > 0) {
        setOutdatedItems(data.outdated);
        toast.success(`✓ Scan compleet: ${data.outdated.length} verouderde items gevonden`);
      } else {
        toast.success("✓ Geen verouderde items gevonden!");
      }
    } catch (error) {
      logger.error("Scan error:", error);
      toast.error("Scan mislukt", {
        description: error instanceof Error ? error.message : "Onbekende fout",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const rejectAllOutdated = async () => {
    const promises = outdatedItems.map((item) => rejectItem(item.id, item.reason));
    await Promise.all(promises);
    setOutdatedItems([]);
    toast.success(`✓ ${outdatedItems.length} items afgewezen!`);
  };

  const getStabilityColor = (score: number) => {
    if (score < 0.5) return "bg-destructive";
    if (score < 0.8) return "bg-warning";
    return "bg-primary";
  };

  const getStabilityLabel = (score: number) => {
    if (score < 0.5) return "Laag";
    if (score < 0.8) return "Gemiddeld";
    return "Hoog";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Auto-Learned Knowledge
            </CardTitle>
            <CardDescription>
              Kennis die het systeem zelfstandig heeft geleerd uit conversaties
            </CardDescription>
          </div>
          {stats.unverified > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {stats.unverified} te verifiëren
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.todayCount}</div>
              <p className="text-xs text-muted-foreground">Vandaag geleerd</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.avgStability}</div>
              <p className="text-xs text-muted-foreground">Gem. Stability</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.avgConfidence}%</div>
              <p className="text-xs text-muted-foreground">Gem. Confidence</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.totalCorrections}</div>
              <p className="text-xs text-muted-foreground">Totaal Correcties</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Totaal Items</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters & Sorting */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Sorteer op..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Meest Recent</SelectItem>
              <SelectItem value="stability-low">Laagste Stability</SelectItem>
              <SelectItem value="confidence-high">Hoogste Confidence</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={showUnverifiedOnly ? "default" : "outline"}
            onClick={() => setShowUnverifiedOnly(!showUnverifiedOnly)}
            className="gap-2"
          >
            {showUnverifiedOnly ? (
              <>
                <CheckCircle className="h-4 w-4" />
                Alle Items
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4" />
                Alleen Onverified
              </>
            )}
          </Button>

          <Button
            variant="secondary"
            onClick={scanOutdatedKnowledge}
            disabled={isScanning}
            className="gap-2"
          >
            {isScanning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Scannen...
              </>
            ) : (
              <>
                <Scan className="h-4 w-4" />
                Scan Verouderde Items
              </>
            )}
          </Button>
        </div>

        {/* Outdated Items Results */}
        {outdatedItems.length > 0 && (
          <Card className="mb-4 border-orange-500">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-orange-600 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Verouderde Items Gevonden
                  </CardTitle>
                  <CardDescription>
                    {outdatedItems.length} items bevatten mogelijk verouderde of onjuiste informatie
                  </CardDescription>
                </div>
                <Button
                  variant="destructive"
                  onClick={rejectAllOutdated}
                  className="gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  Reject Alle {outdatedItems.length}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {outdatedItems.map((item) => (
                    <Card key={item.id} className="p-3">
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline">{item.category}</Badge>
                            <Badge variant="secondary">
                              {Math.round(item.confidence * 100)}% zeker
                            </Badge>
                          </div>
                          <p className="font-medium text-sm mb-1">{item.key}</p>
                          <p className="text-xs text-muted-foreground">{item.reason}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => rejectItem(item.id, item.reason)}
                          className="gap-1 flex-shrink-0"
                        >
                          <XCircle className="h-3 w-3" />
                          Reject
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Knowledge Items List */}
        {items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>Nog geen auto-learned kennis gevonden</p>
          </div>
        ) : (
          <ScrollArea className="h-[600px]">
            <div className="space-y-4 pr-4">
              {items.map((item) => (
                <Card key={item.id} className="border-l-4" style={{
                  borderLeftColor: item.requires_verification ? "hsl(var(--destructive))" : "hsl(var(--primary))"
                }}>
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Badges Row */}
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <Badge variant="outline">{item.category}</Badge>
                          {item.requires_verification ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Te Verifiëren
                            </Badge>
                          ) : (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Geverifieerd
                            </Badge>
                          )}
                          <Badge variant="secondary">
                            Confidence: {Math.round((item.confidence_score || 0) * 100)}%
                          </Badge>
                        </div>

                        {/* Title */}
                        <h4 className="font-semibold mb-3 text-sm break-words">{item.key}</h4>

                        {/* Stability Score Progress */}
                        <div className="mb-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">
                              Stability Score: {getStabilityLabel(item.stability_score || 0)}
                            </span>
                            <span className="font-medium">{(item.stability_score || 0).toFixed(2)}</span>
                          </div>
                          <Progress
                            value={(item.stability_score || 0) * 100}
                            className="h-2"
                          />
                        </div>

                        {/* Metadata */}
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDistanceToNow(new Date(item.created_at), {
                              addSuffix: true,
                              locale: nl,
                            })}
                          </span>
                          {(item.correction_count || 0) > 0 && (
                            <span className="flex items-center gap-1">
                              <Edit className="h-3 w-3" />
                              {item.correction_count} correcties
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedItem(item)}
                          className="gap-2"
                        >
                          <Eye className="h-3 w-3" />
                          Details
                        </Button>
                        {item.requires_verification && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => verifyItem(item.id)}
                              className="gap-2"
                            >
                              <CheckCircle className="h-3 w-3" />
                              Verify
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => rejectItem(item.id)}
                              className="gap-2"
                            >
                              <XCircle className="h-3 w-3" />
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Details Dialog (Simple version - can be enhanced with a proper Dialog component) */}
        {selectedItem && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedItem(null)}>
            <Card className="max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <CardHeader>
                <CardTitle>Knowledge Details</CardTitle>
                <CardDescription>{selectedItem.key}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-1">Category</p>
                    <Badge>{selectedItem.category}</Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1">Value</p>
                    <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[300px]">
                      {JSON.stringify(selectedItem.value, null, 2)}
                    </pre>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium mb-1">Stability Score</p>
                      <p className="text-sm">{(selectedItem.stability_score || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1">Confidence Score</p>
                      <p className="text-sm">{Math.round((selectedItem.confidence_score || 0) * 100)}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1">Correcties</p>
                      <p className="text-sm">{selectedItem.correction_count || 0}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1">Validatie Status</p>
                      <Badge variant={selectedItem.validation_status === "verified" ? "default" : "destructive"}>
                        {selectedItem.validation_status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {selectedItem.requires_verification && (
                      <>
                        <Button 
                          onClick={() => verifyItem(selectedItem.id)} 
                          className="flex-1 gap-2"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Verify
                        </Button>
                        <Button 
                          onClick={() => rejectItem(selectedItem.id)}
                          variant="destructive"
                          className="flex-1 gap-2"
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </Button>
                      </>
                    )}
                    <Button 
                      onClick={() => setSelectedItem(null)} 
                      variant="outline"
                      className={selectedItem.requires_verification ? "flex-1" : "w-full"}
                    >
                      Sluiten
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
