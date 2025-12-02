import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Brain, TrendingUp, Sparkles, Target, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

interface LearningStats {
  totalPatterns: number;
  successPatterns: number;
  totalEvaluations: number;
  avgRating: number;
  rehireRate: number;
  knowledgeGrowth: number;
  topCategories: { category: string; count: number }[];
  recentLearnings: { key: string; created_at: string }[];
}

export function AILearningProgressWidget() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["ai-learning-stats"],
    queryFn: async (): Promise<LearningStats> => {
      // Get success patterns from knowledge base
      const { data: patterns, count: patternCount } = await supabase
        .from("ai_knowledge_base")
        .select("id, category, key, created_at", { count: "exact" })
        .eq("category", "success_patterns")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5);

      // Get all knowledge items count
      const { count: totalKnowledge } = await supabase
        .from("ai_knowledge_base")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null);

      // Get evaluations
      const { data: evaluations } = await supabase
        .from("assignment_evaluations")
        .select("rating, would_rehire");

      // Get category breakdown
      const { data: categories } = await supabase
        .from("ai_knowledge_base")
        .select("category")
        .is("deleted_at", null);

      // Calculate stats
      const evalCount = evaluations?.length || 0;
      const avgRating = evalCount > 0
        ? evaluations!.reduce((sum, e) => sum + (e.rating || 0), 0) / evalCount
        : 0;
      const rehireRate = evalCount > 0
        ? (evaluations!.filter(e => e.would_rehire === true).length / evalCount) * 100
        : 0;

      // Category counts
      const categoryCounts: Record<string, number> = {};
      categories?.forEach(c => {
        categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
      });
      
      const topCategories = Object.entries(categoryCounts)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Knowledge growth (last 7 days vs previous 7 days)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      
      const { count: recentCount } = await supabase
        .from("ai_knowledge_base")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", weekAgo);

      const { count: previousCount } = await supabase
        .from("ai_knowledge_base")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", twoWeeksAgo)
        .lt("created_at", weekAgo);

      const knowledgeGrowth = previousCount && previousCount > 0
        ? ((recentCount || 0) - previousCount) / previousCount * 100
        : 0;

      return {
        totalPatterns: totalKnowledge || 0,
        successPatterns: patternCount || 0,
        totalEvaluations: evalCount,
        avgRating,
        rehireRate,
        knowledgeGrowth,
        topCategories,
        recentLearnings: (patterns || []).map(p => ({ key: p.key, created_at: p.created_at }))
      };
    },
    refetchInterval: 60000 // Refresh every minute
  });

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-violet-50/80 to-background dark:from-violet-950/30">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const learningLevel = stats?.successPatterns || 0;
  const maxLevel = 20;
  const levelProgress = Math.min((learningLevel / maxLevel) * 100, 100);
  const levelLabel = learningLevel < 3 ? "Beginner" : learningLevel < 10 ? "Gevorderd" : "Expert";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="bg-gradient-to-br from-violet-50/80 to-background dark:from-violet-950/30 border-violet-200/50 dark:border-violet-800/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Brain className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            AI Leervoortgang
            <Badge variant="outline" className="ml-auto text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
              {levelLabel}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Learning Level Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Succespatronen geleerd</span>
              <span className="font-medium">{stats?.successPatterns || 0} / {maxLevel}</span>
            </div>
            <Progress value={levelProgress} className="h-2 bg-violet-100 dark:bg-violet-900/30" />
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-background/60 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Target className="h-3 w-3" />
                Evaluaties
              </div>
              <div className="text-lg font-semibold">{stats?.totalEvaluations || 0}</div>
            </div>
            <div className="rounded-lg bg-background/60 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                Gem. Rating
              </div>
              <div className="text-lg font-semibold">
                {stats?.avgRating ? stats.avgRating.toFixed(1) : "—"}
                <span className="text-xs text-muted-foreground">/5</span>
              </div>
            </div>
          </div>

          {/* Recent Learnings */}
          {stats?.recentLearnings && stats.recentLearnings.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-500" />
                Recent geleerd
              </div>
              <div className="space-y-1.5">
                {stats.recentLearnings.slice(0, 3).map((learning, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center gap-2 text-xs bg-background/40 rounded px-2 py-1.5"
                  >
                    <ChevronRight className="h-3 w-3 text-violet-500" />
                    <span className="truncate flex-1">{learning.key}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Knowledge Growth Indicator */}
          {stats?.knowledgeGrowth !== 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
              <TrendingUp className={`h-3 w-3 ${stats.knowledgeGrowth > 0 ? 'text-emerald-500' : 'text-amber-500'}`} />
              <span>
                {stats.knowledgeGrowth > 0 ? '+' : ''}{stats.knowledgeGrowth.toFixed(0)}% kennisgroei deze week
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
