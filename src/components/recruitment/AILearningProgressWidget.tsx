import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Brain, TrendingUp, Sparkles, Target, ChevronRight, Users, Building2, Briefcase } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SuccessPattern {
  functie_niveau: string;
  sector: string | null;
  rating: number;
  would_rehire?: boolean;
  match_score?: number;
}

interface LearningStats {
  totalPatterns: number;
  successPatterns: number;
  totalEvaluations: number;
  avgRating: number;
  rehireRate: number;
  knowledgeGrowth: number;
  topCategories: { category: string; count: number }[];
  recentLearnings: { key: string; created_at: string; value: SuccessPattern }[];
}

// Format technical key to user-friendly text
function formatLearningKey(key: string, value: SuccessPattern): string {
  if (key.startsWith('successful_placement_pattern_')) {
    const functie = value.functie_niveau || key.replace('successful_placement_pattern_', '').replace(/_/g, ' ');
    const sector = value.sector ? ` in ${value.sector}` : '';
    return `✅ ${functie}${sector} plaatsing succesvol`;
  }
  if (key.startsWith('high_rating_')) {
    return `⭐ Hoge score bij ${value.functie_niveau || 'plaatsing'}`;
  }
  if (key.startsWith('rehire_pattern_')) {
    return `🔄 Herplaatsing patroon ontdekt`;
  }
  // Fallback: clean up the key
  return key.replace(/_/g, ' ').replace(/pattern/gi, '').trim();
}

// Get icon for learning type
function getLearningIcon(key: string) {
  if (key.includes('placement') || key.includes('plaatsing')) return <Users className="h-3 w-3 text-emerald-500" />;
  if (key.includes('rating') || key.includes('score')) return <Target className="h-3 w-3 text-amber-500" />;
  if (key.includes('sector')) return <Building2 className="h-3 w-3 text-blue-500" />;
  return <Briefcase className="h-3 w-3 text-violet-500" />;
}

export function AILearningProgressWidget() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["ai-learning-stats"],
    queryFn: async (): Promise<LearningStats> => {
      // Get success patterns from knowledge base with full value
      const { data: patterns, count: patternCount } = await supabase
        .from("ai_knowledge_base")
        .select("id, category, key, value, created_at", { count: "exact" })
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
        recentLearnings: (patterns || []).map(p => ({ 
          key: p.key, 
          created_at: p.created_at,
          value: p.value as unknown as SuccessPattern
        }))
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
    <TooltipProvider>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="ml-auto text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 cursor-help">
                    {levelLabel}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">AI leert van {stats?.totalEvaluations || 0} evaluaties</p>
                  <p className="text-xs text-muted-foreground">en {stats?.successPatterns || 0} succespatronen</p>
                </TooltipContent>
              </Tooltip>
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
            <div className="grid grid-cols-3 gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="rounded-lg bg-background/60 p-2.5 space-y-1 cursor-help">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Target className="h-3 w-3" />
                      Evaluaties
                    </div>
                    <div className="text-lg font-semibold">{stats?.totalEvaluations || 0}</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Aantal plaatsingsevaluaties</p>
                  <p className="text-xs text-muted-foreground">Meer evaluaties = betere AI</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="rounded-lg bg-background/60 p-2.5 space-y-1 cursor-help">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <TrendingUp className="h-3 w-3" />
                      Rating
                    </div>
                    <div className="text-lg font-semibold">
                      {stats?.avgRating ? stats.avgRating.toFixed(1) : "—"}
                      <span className="text-xs text-muted-foreground">/5</span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Gemiddelde plaatsingsscore</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="rounded-lg bg-background/60 p-2.5 space-y-1 cursor-help">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      Herplaats
                    </div>
                    <div className="text-lg font-semibold">
                      {stats?.rehireRate ? `${stats.rehireRate.toFixed(0)}%` : "—"}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">% professionals voor herplaatsing</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Recent Learnings - User-friendly display */}
            {stats?.recentLearnings && stats.recentLearnings.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  Wat AI heeft geleerd
                </div>
                <div className="space-y-1.5">
                  {stats.recentLearnings.slice(0, 3).map((learning, idx) => (
                    <Tooltip key={idx}>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 text-xs bg-background/40 rounded px-2 py-1.5 cursor-help hover:bg-background/60 transition-colors">
                          {getLearningIcon(learning.key)}
                          <span className="truncate flex-1">
                            {formatLearningKey(learning.key, learning.value)}
                          </span>
                          {learning.value?.rating && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {learning.value.rating}★
                            </Badge>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs">
                        <div className="space-y-1 text-xs">
                          {learning.value?.functie_niveau && (
                            <p><strong>Functie:</strong> {learning.value.functie_niveau}</p>
                          )}
                          {learning.value?.sector && (
                            <p><strong>Sector:</strong> {learning.value.sector}</p>
                          )}
                          {learning.value?.match_score !== undefined && (
                            <p><strong>Match score:</strong> {learning.value.match_score}%</p>
                          )}
                          {learning.value?.would_rehire !== undefined && (
                            <p><strong>Herplaatsing:</strong> {learning.value.would_rehire ? 'Ja' : 'Nee'}</p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
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

            {/* Tip for improving AI */}
            {(stats?.totalEvaluations || 0) < 10 && (
              <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 rounded-md p-2 border border-amber-200/50 dark:border-amber-800/50">
                💡 <strong>Tip:</strong> Voeg meer evaluaties toe aan afgeronde plaatsingen om de AI te verbeteren.
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </TooltipProvider>
  );
}
