import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, TrendingDown, Database, Clock, Euro } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface KvKMetrics {
  total_api_calls: number;
  cache_hits: number;
  cache_misses: number;
  hit_rate: number;
  total_cost: number;
  total_saved: number;
  avg_data_age_days: number;
  stale_items_count: number;
  top_businesses: Array<{ kvk_nummer: string; hit_count: number }>;
}

export function KvKCostDashboard() {
  const { toast } = useToast();

  // Fetch KVK cache statistics
  const { data: cacheStats, isLoading } = useQuery({
    queryKey: ['kvk-cache-stats'],
    queryFn: async () => {
      const { data: cacheData, error: cacheError } = await supabase
        .from('kvk_validation_cache')
        .select('kvk_nummer, hit_count, cached_at, expires_at');

      if (cacheError) throw cacheError;

      const { data: kbData, error: kbError } = await supabase
        .from('ai_knowledge_base')
        .select('last_kvk_check, data_freshness_days')
        .eq('source_type', 'kvk_api')
        .not('last_kvk_check', 'is', null);

      if (kbError) throw kbError;

      // Calculate metrics
      const totalCacheHits = cacheData?.reduce((sum, c) => sum + (c.hit_count || 0), 0) || 0;
      const totalApiCalls = cacheData?.length || 0;
      const hitRate = totalCacheHits > 0 ? (totalCacheHits / (totalCacheHits + totalApiCalls)) * 100 : 0;

      // Calculate stale items
      const now = Date.now();
      const staleItems = kbData?.filter(kb => {
        if (!kb.last_kvk_check) return false;
        const daysSince = (now - new Date(kb.last_kvk_check).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > (kb.data_freshness_days || 90);
      }).length || 0;

      // Average data age
      const avgAge = kbData?.length > 0
        ? kbData.reduce((sum, kb) => {
            const age = kb.last_kvk_check 
              ? (now - new Date(kb.last_kvk_check).getTime()) / (1000 * 60 * 60 * 24)
              : 0;
            return sum + age;
          }, 0) / kbData.length
        : 0;

      // Top businesses
      const topBusinesses = cacheData
        ?.sort((a, b) => (b.hit_count || 0) - (a.hit_count || 0))
        .slice(0, 5)
        .map(c => ({ kvk_nummer: c.kvk_nummer, hit_count: c.hit_count || 0 })) || [];

      const metrics: KvKMetrics = {
        total_api_calls: totalApiCalls,
        cache_hits: totalCacheHits,
        cache_misses: totalApiCalls,
        hit_rate: hitRate,
        total_cost: totalApiCalls * 0.30,
        total_saved: totalCacheHits * 0.30,
        avg_data_age_days: Math.round(avgAge),
        stale_items_count: staleItems,
        top_businesses: topBusinesses
      };

      return metrics;
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const handleForceRefresh = async (kvkNummer: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: orgData } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      if (!orgData) throw new Error('No organization found');

      toast({
        title: "KVK Data Refreshen...",
        description: `Ophalen nieuwe data voor ${kvkNummer}`,
      });

      const { data, error } = await supabase.functions.invoke('kvk-smart-lookup', {
        body: {
          query: kvkNummer,
          org_id: orgData.org_id,
          force_refresh: true
        }
      });

      if (error) throw error;

      toast({
        title: "✅ Data Gerefreshed",
        description: `KVK ${kvkNummer} is bijgewerkt met nieuwste gegevens`,
      });
    } catch (error) {
      console.error('Force refresh error:', error);
      toast({
        title: "❌ Refresh Mislukt",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>KVK API Cost Dashboard</CardTitle>
          <CardDescription>Laden...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cacheStats?.hit_rate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {cacheStats?.cache_hits} hits / {cacheStats?.cache_hits + cacheStats?.cache_misses} queries
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Euro className="h-4 w-4" />
              Cost Saved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">€{cacheStats?.total_saved.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Door caching (vs €{cacheStats?.total_cost.toFixed(2)} totaal)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Data Freshness
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cacheStats?.avg_data_age_days}d</div>
            <p className="text-xs text-muted-foreground mt-1">
              Gemiddelde leeftijd van data
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Stale Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{cacheStats?.stale_items_count}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Items ouder dan 90 dagen
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top Queried Businesses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Most Queried Businesses
          </CardTitle>
          <CardDescription>
            Bedrijven waarvan KVK data het vaakst is opgehaald
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {cacheStats?.top_businesses.map((business) => (
              <div key={business.kvk_nummer} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">KVK: {business.kvk_nummer}</div>
                    <div className="text-sm text-muted-foreground">
                      {business.hit_count} cache hits = €{(business.hit_count * 0.30).toFixed(2)} saved
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleForceRefresh(business.kvk_nummer)}
                >
                  Refresh
                </Button>
              </div>
            ))}
            {(!cacheStats?.top_businesses || cacheStats.top_businesses.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                Nog geen KVK data opgevraagd
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cost Optimization Tips */}
      <Card>
        <CardHeader>
          <CardTitle>💡 Cost Optimization Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="mt-1">✅</Badge>
              <div className="text-sm">
                <strong>Smart Caching:</strong> KVK data wordt 90 dagen gecached, bespaart €{cacheStats?.total_saved.toFixed(2)}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="mt-1">🎯</Badge>
              <div className="text-sm">
                <strong>Database First:</strong> AI checked altijd eerst eigen knowledge base voor €0 queries
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="mt-1">⚡</Badge>
              <div className="text-sm">
                <strong>Hit Rate:</strong> {cacheStats?.hit_rate.toFixed(0)}% van queries gebruikt cache (doel: &gt;95%)
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
