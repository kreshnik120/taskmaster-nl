import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, TrendingUp, Target, Database, Lightbulb, AlertCircle, Activity, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { AdminOnly } from "@/components/auth/AdminOnly";
import { LearningProgressCharts } from "./LearningProgressCharts";
import { TopValidatorsLeaderboard } from "./TopValidatorsLeaderboard";
import { GroupedCategoryDisplay } from "./GroupedCategoryDisplay";
import { useNavigate } from "react-router-dom";
import { CATEGORY_TO_GROUP, getCoverageIcon } from "@/lib/constants/knowledgeCategoryHierarchy";

export const LearningDashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  // Fetch validation stats for health dashboard
  const { data: stats } = useQuery({
    queryKey: ["validation-stats-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_knowledge_base")
        .select("validation_status")
        .is("deleted_at", null);
      
      if (error) throw error;
      
      const unverified = data.filter(d => d.validation_status === "unverified").length;
      return { unverified };
    },
  });


  // Fetch knowledge base stats with FULL coverage data (embedded + total per category)
  const { data: knowledgeStats, refetch: refetchKnowledgeStats } = useQuery({
    queryKey: ['ai-knowledge-stats-grouped'],
    queryFn: async () => {
      // Fetch ALL knowledge items (for total counts)
      const { data: allItems, error: allError } = await supabase
        .from('ai_knowledge_base')
        .select('id, category, confidence_score, usage_count, created_at, key')
        .is('deleted_at', null);
      
      if (allError) throw allError;

      // Fetch embedded knowledge IDs
      const { data: embeddedData, error: embError } = await supabase
        .from('knowledge_embeddings')
        .select('knowledge_id');
      
      if (embError) throw embError;
      
      const embeddedIds = new Set(embeddedData?.map(e => e.knowledge_id) || []);
      
      // Build category stats with total + embedded counts
      const categoryData: Record<string, { total: number; embedded: number; usage: number }> = {};
      
      allItems?.forEach((item: any) => {
        const cat = item.category;
        if (!categoryData[cat]) {
          categoryData[cat] = { total: 0, embedded: 0, usage: 0 };
        }
        categoryData[cat].total += 1;
        categoryData[cat].usage += item.usage_count || 0;
        if (embeddedIds.has(item.id)) {
          categoryData[cat].embedded += 1;
        }
      });
      
      // Calculate totals
      const totalItems = allItems?.length || 0;
      const totalEmbedded = embeddedIds.size;
      const avgConfidence = allItems?.reduce((sum: number, item: any) => sum + (item.confidence_score || 0), 0) / (totalItems || 1);
      const totalUsage = allItems?.reduce((sum: number, item: any) => sum + (item.usage_count || 0), 0) || 0;
      
      // Recent embedded items for display
      const embeddedItems = allItems?.filter((item: any) => embeddedIds.has(item.id)) || [];
      const recentItems = embeddedItems
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);
      
      // Calculate overall coverage
      const overallCoverage = totalItems > 0 ? Math.round((totalEmbedded / totalItems) * 100) : 0;
      
      return {
        total: totalItems,
        totalEmbedded,
        overallCoverage,
        categoryCount: Object.keys(categoryData).length,
        categoryData, // Full stats per category
        avgConfidence: avgConfidence.toFixed(2),
        totalUsage,
        recentItems
      };
    }
  });

  // Separate query for accurate usage statistics
  const { data: usageStats } = useQuery({
    queryKey: ['usage-stats'],
    queryFn: async () => {
      const { count: activeCount } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .gt('usage_count', 0);

      const { count: totalCount } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);

      return {
        activeCount: activeCount || 0,
        totalCount: totalCount || 0,
        percentage: totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0
      };
    },
    refetchInterval: 30000,
  });

  // Fetch learning events
  const { data: learningEvents, refetch: refetchLearningEvents } = useQuery({
    queryKey: ['learning-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_learning_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    }
  });

  // Fetch business intelligence
  const { data: businessIntel, refetch: refetchBusinessIntel } = useQuery({
    queryKey: ['business-intelligence'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_intelligence')
        .select('*')
        .order('impact_score', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    }
  });

  // Fetch 24H KB growth for health dashboard
  const { data: kbGrowthData } = useQuery({
    queryKey: ['kb-growth-24h'],
    queryFn: async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { count: kbGrowth } = await supabase
        .from('ai_knowledge_base')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo);

      return kbGrowth || 0;
    },
    refetchInterval: 30000 // refresh every 30s
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'user_preference': return <Target className="h-4 w-4" />;
      case 'business_rule': return <Database className="h-4 w-4" />;
      case 'workflow_pattern': return <TrendingUp className="h-4 w-4" />;
      case 'decision_context': return <Lightbulb className="h-4 w-4" />;
      default: return <Brain className="h-4 w-4" />;
    }
  };

  const getEventTypeBadge = (eventType: string) => {
    const colors: Record<string, string> = {
      'feedback_positive': 'bg-green-500/10 text-green-700 dark:text-green-400',
      'feedback_negative': 'bg-red-500/10 text-red-700 dark:text-red-400',
      'suggestion_accepted': 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
      'suggestion_rejected': 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
      'pattern_detected': 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
      'task_completed': 'bg-green-500/10 text-green-700 dark:text-green-400',
    };
    
    return (
      <Badge variant="outline" className={colors[eventType] || ''}>
        {eventType.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const getIntelTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      'workflow_pattern': 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
      'bottleneck': 'bg-red-500/10 text-red-700 dark:text-red-400',
      'optimization_opportunity': 'bg-green-500/10 text-green-700 dark:text-green-400',
      'productivity_insight': 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
    };
    
    return (
      <Badge variant="outline" className={colors[type] || ''}>
        {type.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const verificationRate = knowledgeStats?.total 
    ? ((knowledgeStats.total - (stats?.unverified || 0)) / knowledgeStats.total * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Persistent Validation CTA Widget */}
      {stats && stats.unverified > 100 && (
        <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              <CardTitle>⚠️ Action Required: {stats.unverified.toLocaleString()} Items Need Validation</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="mb-4">Your AI's quality depends on verified knowledge. Start validating to unlock 40-60% accuracy improvements.</p>
            <Button 
              onClick={() => navigate('/ai-training?tab=validation')}
              variant="secondary"
              className="w-full bg-white text-blue-600 hover:bg-white/90"
            >
              Start Validating Now →
            </Button>
          </CardContent>
        </Card>
      )}


      {/* Learning Progress Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">🚀 Learning Progress</h2>
          <p className="text-muted-foreground">Laatste 30 dagen AI verbetering en trends</p>
        </div>
        <LearningProgressCharts />
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Database className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Kennis Items</p>
              <p className="text-2xl font-bold">{knowledgeStats?.total || 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <Brain className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Gem. Betrouwbaarheid</p>
              <p className="text-2xl font-bold">{(parseFloat(knowledgeStats?.avgConfidence || '0') * 100).toFixed(0)}%</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-500/10 rounded-lg">
              <Activity className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Learning Events Vandaag</p>
              <p className="text-2xl font-bold">
                {learningEvents?.filter((e: any) => {
                  const today = new Date().toDateString();
                  return new Date(e.created_at).toDateString() === today;
                }).length || 0}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/10 rounded-lg">
              <TrendingUp className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Totaal Gebruik</p>
              <p className="text-2xl font-bold">{knowledgeStats?.totalUsage || 0}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* KB Health Dashboard */}
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Knowledge Base Health Dashboard
        </h2>
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Verification Rate</p>
            <div className="text-2xl font-bold text-green-600">
              {knowledgeStats?.total 
                ? Math.round((knowledgeStats.total - (stats?.unverified || 0)) / knowledgeStats.total * 100)
                : 0}%
            </div>
            <Progress 
              value={knowledgeStats?.total 
                ? ((knowledgeStats.total - (stats?.unverified || 0)) / knowledgeStats.total * 100)
                : 0} 
              className="mt-2" 
            />
          </Card>

          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Avg Confidence</p>
            <div className="text-2xl font-bold text-blue-600">
              {(parseFloat(knowledgeStats?.avgConfidence || '0') * 100).toFixed(0)}%
            </div>
            <Progress 
              value={parseFloat(knowledgeStats?.avgConfidence || '0') * 100} 
              className="mt-2" 
            />
          </Card>

          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Usage Score</p>
            <div className="text-2xl font-bold text-purple-600">
              {usageStats?.percentage || 0}%
            </div>
            <Progress 
              value={usageStats?.percentage || 0} 
              className="mt-2" 
            />
            <p className="text-xs text-muted-foreground mt-1">
              {usageStats?.activeCount || 0} van {usageStats?.totalCount || 0} items actief gebruikt
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Growth (24h)</p>
            <div className="text-2xl font-bold text-orange-600">
              +{kbGrowthData || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              nieuwe items
            </p>
          </Card>
        </div>

        {/* Top Validators Leaderboard */}
        <AdminOnly>
          <TopValidatorsLeaderboard />
        </AdminOnly>

      </Card>

      {/* Detailed Tabs */}
      <Tabs defaultValue="knowledge" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="knowledge">Kennis Base</TabsTrigger>
          <TabsTrigger value="learning">Leer Geschiedenis</TabsTrigger>
          <TabsTrigger value="intelligence">Business Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="knowledge" className="mt-4">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Database className="h-5 w-5" />
                Kennis Categorieën
              </h3>
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="outline" className="gap-1">
                  {getCoverageIcon(knowledgeStats?.overallCoverage || 0)}
                  {knowledgeStats?.overallCoverage || 0}% AI Coverage
                </Badge>
                <span className="text-muted-foreground">
                  {knowledgeStats?.totalEmbedded?.toLocaleString() || 0} / {knowledgeStats?.total?.toLocaleString() || 0} items bruikbaar
                </span>
              </div>
            </div>
            
            {knowledgeStats?.total === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nog geen kennis opgeslagen. Begin met chatten met de AI assistant!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Grouped Category Display */}
                <GroupedCategoryDisplay categoryData={knowledgeStats?.categoryData || {}} />

                <div>
                  <h4 className="text-sm font-medium mb-2">Recent Toegevoegd (met embedding)</h4>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {knowledgeStats?.recentItems?.map((item: any, index: number) => (
                        <div key={item.id || `recent-${index}`} className="p-3 bg-muted/50 rounded-lg text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                {getCategoryIcon(item.category)}
                                <span className="font-medium">{item.key}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Betrouwbaarheid: {((item.confidence_score || 0) * 100).toFixed(0)}% • 
                                Gebruikt: {item.usage_count || 0}x
                              </p>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {item.category.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="learning" className="mt-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Leer Geschiedenis
            </h3>
            
            {!learningEvents || learningEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nog geen leer events. De AI begint automatisch te leren van interacties!</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {learningEvents.map((event) => (
                    <div key={`event-${event.id}`} className="p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        {getEventTypeBadge(event.event_type)}
                        <span className="text-xs text-muted-foreground">
                          {new Date(event.created_at).toLocaleDateString('nl-NL', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Outcome:</span>
                          <Badge variant={event.outcome === 'success' ? 'default' : 'destructive'}>
                            {event.outcome}
                          </Badge>
                          {event.learning_score && (
                            <span className="text-xs text-muted-foreground">
                              Score: {(event.learning_score * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                        {event.context && (
                          <p className="text-xs text-muted-foreground">
                            Context: {JSON.stringify(event.context).substring(0, 150)}...
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="intelligence" className="mt-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Business Intelligence
            </h3>
            
            {!businessIntel || businessIntel.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nog geen business insights. De AI detecteert automatisch patronen en optimalisaties!</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {businessIntel.map((intel) => (
                    <div key={`intel-${intel.id}`} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold">{intel.title}</h4>
                        {getIntelTypeBadge(intel.intelligence_type)}
                      </div>
                      
                      {intel.description && (
                        <p className="text-sm text-muted-foreground mb-3">{intel.description}</p>
                      )}
                      
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1">
                          <Target className="h-3 w-3" />
                          <span>Impact: {intel.impact_score}/10</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {intel.priority}
                        </Badge>
                        <Badge variant="outline" className={
                          intel.status === 'active' ? 'bg-green-500/10' : 'bg-gray-500/10'
                        }>
                          {intel.status}
                        </Badge>
                        <span className="text-muted-foreground ml-auto">
                          {new Date(intel.detected_at).toLocaleDateString('nl-NL')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};