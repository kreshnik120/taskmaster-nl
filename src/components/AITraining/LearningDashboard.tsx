import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, Target, Database, Lightbulb, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const LearningDashboard = () => {
  // Fetch knowledge base stats
  const { data: knowledgeStats } = useQuery({
    queryKey: ['ai-knowledge-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_knowledge_base')
        .select('category, confidence_score, usage_count, created_at');
      
      if (error) throw error;
      
      const categories = data?.reduce((acc: any, item: any) => {
        acc[item.category] = (acc[item.category] || 0) + 1;
        return acc;
      }, {});
      
      const avgConfidence = data?.reduce((sum: number, item: any) => sum + (item.confidence_score || 0), 0) / (data?.length || 1);
      const totalUsage = data?.reduce((sum: number, item: any) => sum + (item.usage_count || 0), 0);
      
      return {
        total: data?.length || 0,
        categories,
        avgConfidence: avgConfidence.toFixed(2),
        totalUsage,
        recentItems: data?.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5)
      };
    }
  });

  // Fetch learning events
  const { data: learningEvents } = useQuery({
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
  const { data: businessIntel } = useQuery({
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

  return (
    <div className="space-y-6">
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
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Totaal Gebruik</p>
              <p className="text-2xl font-bold">{knowledgeStats?.totalUsage || 0}x</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/10 rounded-lg">
              <Lightbulb className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Leer Events</p>
              <p className="text-2xl font-bold">{learningEvents?.length || 0}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="knowledge" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="knowledge">Kennis Base</TabsTrigger>
          <TabsTrigger value="learning">Leer Geschiedenis</TabsTrigger>
          <TabsTrigger value="intelligence">Business Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="knowledge" className="mt-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Database className="h-5 w-5" />
              Kennis Categorieën
            </h3>
            
            {knowledgeStats?.total === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nog geen kennis opgeslagen. Begin met chatten met de AI assistant!</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(knowledgeStats?.categories || {}).map(([category, count]) => (
                    <div key={category} className="p-4 bg-muted rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        {getCategoryIcon(category)}
                        <span className="text-xs font-medium capitalize">
                          {category.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-2xl font-bold">{count as number}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2">Recent Toegevoegd</h4>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {knowledgeStats?.recentItems?.map((item: any) => (
                        <div key={item.id} className="p-3 bg-muted/50 rounded-lg text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                {getCategoryIcon(item.category)}
                                <span className="font-medium">{item.key}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Betrouwbaarheid: {(item.confidence_score * 100).toFixed(0)}% • 
                                Gebruikt: {item.usage_count}x
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
                    <div key={event.id} className="p-4 bg-muted/50 rounded-lg">
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
                    <div key={intel.id} className="p-4 border rounded-lg">
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
