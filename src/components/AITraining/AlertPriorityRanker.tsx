import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, AlertTriangle, Target, Clock, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RankedAlert {
  id: string;
  title: string;
  severity: string;
  type: string;
  category?: string;
  created_at: string;
  priority_score: number;
  frequency: number;
  recency_hours: number;
  data?: any;
}

export function AlertPriorityRanker() {
  const { toast } = useToast();

  // Fetch and rank alerts
  const { data: rankedAlerts, isLoading } = useQuery({
    queryKey: ["ranked-alerts"],
    queryFn: async () => {
      // Get all active critical alerts
      const { data: alerts, error } = await supabase
        .from("business_intelligence")
        .select("*")
        .eq("severity", "critical")
        .eq("status", "active")
        .order("detected_at", { ascending: false });

      if (error) throw error;

      // Calculate priority scores
      const ranked = alerts?.map((alert: any) => {
        const hoursSinceDetection = 
          (Date.now() - new Date(alert.detected_at).getTime()) / (1000 * 60 * 60);
        
        // Count similar alerts (by type and category)
        const frequency = alerts.filter(
          (a: any) => 
            a.type === alert.type && 
            a.data?.category === alert.data?.category
        ).length;

        // Priority score calculation:
        // - Frequency (max 50 points): more duplicates = higher priority
        // - Recency (max 30 points): newer = higher priority
        // - Category impact (max 20 points): certain categories are more critical
        const frequencyScore = Math.min(frequency * 5, 50);
        const recencyScore = Math.max(30 - hoursSinceDetection, 0);
        const categoryImpact = alert.data?.category === "hr" ? 20 : 10;
        
        const priorityScore = frequencyScore + recencyScore + categoryImpact;

        return {
          ...alert,
          priority_score: Math.round(priorityScore),
          frequency,
          recency_hours: Math.round(hoursSinceDetection),
        } as RankedAlert;
      }) || [];

      // Sort by priority score
      return ranked.sort((a, b) => b.priority_score - a.priority_score);
    },
  });

  const handleBulkMergeDuplicates = async () => {
    try {
      // Find groups of duplicates (same type + category)
      const duplicateGroups: { [key: string]: RankedAlert[] } = {};
      
      rankedAlerts?.forEach((alert) => {
        const key = `${alert.type}_${alert.data?.category || "none"}`;
        if (!duplicateGroups[key]) duplicateGroups[key] = [];
        duplicateGroups[key].push(alert);
      });

      let mergedCount = 0;
      
      // For each group with duplicates, keep the most recent and mark others as resolved
      for (const group of Object.values(duplicateGroups)) {
        if (group.length > 1) {
          // Sort by recency, keep first (most recent)
          const sortedGroup = group.sort((a, b) => a.recency_hours - b.recency_hours);
          const [keep, ...toResolve] = sortedGroup;
          
          // Mark duplicates as resolved
          for (const alert of toResolve) {
            await supabase
              .from("business_intelligence")
              .update({ 
                status: "resolved",
                data: {
                  ...alert.data,
                  resolution_note: `Merged into alert ${keep.id}`,
                  merged_at: new Date().toISOString(),
                }
              })
              .eq("id", alert.id);
            mergedCount++;
          }

          // Update the kept alert with frequency info
          await supabase
            .from("business_intelligence")
            .update({
              data: {
                ...keep.data,
                duplicate_count: toResolve.length,
                last_merged_at: new Date().toISOString(),
              }
            })
            .eq("id", keep.id);
        }
      }

      toast({
        title: "Duplicaten samengevoegd",
        description: `${mergedCount} duplicate alerts zijn opgelost`,
      });

      // Refresh data
      window.location.reload();
    } catch (error: any) {
      toast({
        title: "Fout bij samenvoegen",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getPriorityBadge = (score: number) => {
    if (score >= 80) return <Badge className="bg-red-500">🔥 Urgent</Badge>;
    if (score >= 60) return <Badge className="bg-orange-500">⚠️ Hoog</Badge>;
    if (score >= 40) return <Badge className="bg-yellow-500">📊 Medium</Badge>;
    return <Badge variant="outline">📋 Laag</Badge>;
  };

  if (isLoading) {
    return <div className="text-center py-4">Laden...</div>;
  }

  const topTenAlerts = rankedAlerts?.slice(0, 10) || [];
  const quickWins = rankedAlerts?.filter(a => a.frequency >= 5) || [];

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4" />
              Top Priority Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{topTenAlerts.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Quick Wins (5+ duplicates)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{quickWins.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Gem. Priority Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {rankedAlerts?.length 
                ? Math.round(rankedAlerts.reduce((sum, a) => sum + a.priority_score, 0) / rankedAlerts.length)
                : 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Bulk Acties</CardTitle>
          <CardDescription>
            Voer acties uit op meerdere alerts tegelijk
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleBulkMergeDuplicates} className="gap-2">
            <Zap className="h-4 w-4" />
            Voeg Duplicaten Samen ({quickWins.length} groepen)
          </Button>
        </CardContent>
      </Card>

      {/* Top 10 Priority Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Top 10 Priority Alerts
          </CardTitle>
          <CardDescription>
            Hoogste prioriteit op basis van frequency, recency en impact
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {topTenAlerts.map((alert, index) => (
                <Card key={alert.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">#{index + 1}</Badge>
                      {getPriorityBadge(alert.priority_score)}
                      <Badge variant="outline">{alert.type}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Score: {alert.priority_score}
                    </div>
                  </div>
                  
                  <h4 className="font-semibold mb-2">{alert.title}</h4>
                  
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      {alert.frequency}x voorgekomen
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {alert.recency_hours}u geleden
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Quick Wins Section */}
      {quickWins.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Quick Wins (High-Frequency Alerts)
            </CardTitle>
            <CardDescription>
              Deze alerts komen vaak voor en kunnen in bulk worden opgelost
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {quickWins.slice(0, 5).map((alert) => (
                  <div key={alert.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{alert.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {alert.data?.category || "Geen categorie"}
                      </p>
                    </div>
                    <Badge variant="outline" className="ml-2">
                      {alert.frequency}x
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
