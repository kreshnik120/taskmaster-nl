import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Star, TrendingUp, CheckCircle2, AlertTriangle, 
  Target, Lightbulb, BarChart3 
} from "lucide-react";

interface EvaluationStats {
  totalEvaluations: number;
  avgRating: number;
  wouldRehirePercent: number;
  matchAccuracyPercent: number;
  knowledgeCreated: number;
  topSuccessFactors: string[];
  improvementAreas: string[];
}

export function EvaluationLearningWidget() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["evaluation-learning-stats"],
    queryFn: async (): Promise<EvaluationStats> => {
      // Get evaluation events from system_events
      const { data: evalEvents } = await supabase
        .from("system_events")
        .select("event_data, metadata, learning_outcome")
        .eq("event_type", "assignment_evaluation_created")
        .not("processed_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);

      // Get knowledge created from evaluations
      const { count: knowledgeCount } = await supabase
        .from("ai_knowledge_base")
        .select("*", { count: "exact", head: true })
        .like("source", "system_event:assignment_evaluation%");

      // Get success pattern knowledge
      const { data: successPatterns } = await supabase
        .from("ai_knowledge_base")
        .select("key, value, occurrence_count")
        .eq("category", "success_patterns")
        .order("occurrence_count", { ascending: false })
        .limit(5);

      // Get improvement areas
      const { data: improvements } = await supabase
        .from("ai_knowledge_base")
        .select("key, value")
        .eq("category", "improvement_areas")
        .order("created_at", { ascending: false })
        .limit(5);

      if (!evalEvents || evalEvents.length === 0) {
        return {
          totalEvaluations: 0,
          avgRating: 0,
          wouldRehirePercent: 0,
          matchAccuracyPercent: 0,
          knowledgeCreated: knowledgeCount || 0,
          topSuccessFactors: [],
          improvementAreas: [],
        };
      }

      // Calculate stats
      const ratings = evalEvents
        .map(e => (e.event_data as any)?.rating)
        .filter(r => typeof r === "number");
      
      const avgRating = ratings.length > 0 
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length 
        : 0;

      const wouldRehireCount = evalEvents
        .filter(e => (e.event_data as any)?.would_rehire === true).length;

      const matchAccurate = evalEvents
        .filter(e => (e.metadata as any)?.match_score_predicted_correctly === true).length;

      // Extract success factors from patterns
      const topSuccessFactors = successPatterns
        ?.map(p => {
          const val = p.value as any;
          return val?.insight || val?.functie_niveau || p.key;
        })
        .filter(Boolean)
        .slice(0, 3) || [];

      // Extract improvement areas
      const improvementAreas = improvements
        ?.map(i => {
          const val = i.value as any;
          return val?.recommendation || val?.potential_issues?.[0] || i.key;
        })
        .filter(Boolean)
        .slice(0, 3) || [];

      return {
        totalEvaluations: evalEvents.length,
        avgRating: Math.round(avgRating * 10) / 10,
        wouldRehirePercent: Math.round((wouldRehireCount / evalEvents.length) * 100),
        matchAccuracyPercent: Math.round((matchAccurate / evalEvents.length) * 100),
        knowledgeCreated: knowledgeCount || 0,
        topSuccessFactors,
        improvementAreas,
      };
    },
    refetchInterval: 60000, // Refresh every minute
    refetchIntervalInBackground: false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Evaluatie Leren
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.totalEvaluations === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Evaluatie Leren
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nog geen evaluaties verwerkt</p>
            <p className="text-sm">Evaluaties van afgeronde plaatsingen worden hier geanalyseerd</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Evaluatie Leren
          <Badge variant="secondary" className="ml-auto">
            {stats.totalEvaluations} verwerkt
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 rounded-lg bg-gradient-to-br from-yellow-50/80 to-white/60 dark:from-yellow-950/30 dark:to-background/60 border">
            <Star className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
            <div className="text-2xl font-bold">{stats.avgRating}</div>
            <div className="text-xs text-muted-foreground">Gem. Rating</div>
          </div>
          
          <div className="text-center p-3 rounded-lg bg-gradient-to-br from-green-50/80 to-white/60 dark:from-green-950/30 dark:to-background/60 border">
            <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-500" />
            <div className="text-2xl font-bold">{stats.wouldRehirePercent}%</div>
            <div className="text-xs text-muted-foreground">Herplaatsbaar</div>
          </div>
          
          <div className="text-center p-3 rounded-lg bg-gradient-to-br from-blue-50/80 to-white/60 dark:from-blue-950/30 dark:to-background/60 border">
            <Target className="h-5 w-5 mx-auto mb-1 text-blue-500" />
            <div className="text-2xl font-bold">{stats.matchAccuracyPercent}%</div>
            <div className="text-xs text-muted-foreground">Match Accuracy</div>
          </div>
          
          <div className="text-center p-3 rounded-lg bg-gradient-to-br from-purple-50/80 to-white/60 dark:from-purple-950/30 dark:to-background/60 border">
            <Lightbulb className="h-5 w-5 mx-auto mb-1 text-purple-500" />
            <div className="text-2xl font-bold">{stats.knowledgeCreated}</div>
            <div className="text-xs text-muted-foreground">Kennis Items</div>
          </div>
        </div>

        {/* Success Factors */}
        {stats.topSuccessFactors.length > 0 && (
          <div>
            <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Geleerde Succesfactoren
            </h4>
            <div className="space-y-1">
              {stats.topSuccessFactors.map((factor, i) => (
                <div 
                  key={i} 
                  className="text-sm p-2 rounded-md bg-green-50/50 dark:bg-green-950/20 text-green-700 dark:text-green-300 border border-green-200/50 dark:border-green-800/50"
                >
                  ✅ {factor}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Improvement Areas */}
        {stats.improvementAreas.length > 0 && (
          <div>
            <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Verbeterpunten Geïdentificeerd
            </h4>
            <div className="space-y-1">
              {stats.improvementAreas.map((area, i) => (
                <div 
                  key={i} 
                  className="text-sm p-2 rounded-md bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/50"
                >
                  ⚠️ {area}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}