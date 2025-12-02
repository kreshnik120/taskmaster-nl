import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Star, RefreshCw, Target, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RatingTrendSparkline } from "./RatingTrendSparkline";

interface EvaluationStats {
  avgRating: number;
  wouldRehirePercent: number;
  matchAccuracy: number;
  totalEvaluations: number;
  ratingTrend: 'up' | 'down' | 'stable';
  rehireTrend: 'up' | 'down' | 'stable';
}

export function PlacementEvaluationKPIs() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["placement-evaluation-kpis"],
    queryFn: async (): Promise<EvaluationStats> => {
      // Get all evaluations
      const { data: evaluations, error } = await supabase
        .from("assignment_evaluations")
        .select(`
          id, rating, would_rehire, created_at,
          assignments!inner(ai_match_score)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!evaluations || evaluations.length === 0) {
        return {
          avgRating: 0,
          wouldRehirePercent: 0,
          matchAccuracy: 0,
          totalEvaluations: 0,
          ratingTrend: 'stable',
          rehireTrend: 'stable'
        };
      }

      // Calculate averages
      const avgRating = evaluations.reduce((sum, e) => sum + e.rating, 0) / evaluations.length;
      const wouldRehireCount = evaluations.filter(e => e.would_rehire === true).length;
      const wouldRehirePercent = (wouldRehireCount / evaluations.length) * 100;

      // Calculate match accuracy (correlation between AI score and positive outcome)
      const evaluationsWithScore = evaluations.filter(e => (e.assignments as any)?.ai_match_score != null);
      let matchAccuracy = 0;
      if (evaluationsWithScore.length > 0) {
        const accurateMatches = evaluationsWithScore.filter(e => {
          const aiScore = (e.assignments as any).ai_match_score;
          const positiveOutcome = e.rating >= 4 && e.would_rehire !== false;
          return (aiScore >= 70 && positiveOutcome) || (aiScore < 70 && !positiveOutcome);
        });
        matchAccuracy = (accurateMatches.length / evaluationsWithScore.length) * 100;
      }

      // Calculate trends (last 10 vs previous 10)
      const recent = evaluations.slice(0, 10);
      const previous = evaluations.slice(10, 20);

      let ratingTrend: 'up' | 'down' | 'stable' = 'stable';
      let rehireTrend: 'up' | 'down' | 'stable' = 'stable';

      if (previous.length >= 5) {
        const recentAvgRating = recent.reduce((s, e) => s + e.rating, 0) / recent.length;
        const prevAvgRating = previous.reduce((s, e) => s + e.rating, 0) / previous.length;
        if (recentAvgRating > prevAvgRating + 0.2) ratingTrend = 'up';
        else if (recentAvgRating < prevAvgRating - 0.2) ratingTrend = 'down';

        const recentRehire = recent.filter(e => e.would_rehire === true).length / recent.length;
        const prevRehire = previous.filter(e => e.would_rehire === true).length / previous.length;
        if (recentRehire > prevRehire + 0.1) rehireTrend = 'up';
        else if (recentRehire < prevRehire - 0.1) rehireTrend = 'down';
      }

      return {
        avgRating,
        wouldRehirePercent,
        matchAccuracy,
        totalEvaluations: evaluations.length,
        ratingTrend,
        rehireTrend
      };
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
    if (trend === 'up') return <TrendingUp className="h-3 w-3 text-emerald-500" />;
    if (trend === 'down') return <TrendingDown className="h-3 w-3 text-red-500" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-border/50">
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats || stats.totalEvaluations === 0) {
    return null;
  }

  const getRatingLabel = (rating: number) => {
    if (rating >= 4.5) return "Uitstekend";
    if (rating >= 4) return "Goed";
    if (rating >= 3) return "Voldoende";
    return "Onvoldoende";
  };

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Avg Rating with Sparkline */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="border-border/50 bg-gradient-to-br from-amber-50/80 to-white/60 dark:from-amber-950/30 dark:to-background/60 backdrop-blur-sm cursor-help">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Gem. Rating</span>
                  <TrendIcon trend={stats.ratingTrend} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                    <span className="text-2xl font-semibold">{stats.avgRating.toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground">/5</span>
                  </div>
                  <RatingTrendSparkline />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{getRatingLabel(stats.avgRating)}</p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>Gemiddelde rating van {stats.totalEvaluations} evaluaties</p>
            <p className="text-xs text-muted-foreground">Sparkline toont trend laatste 30 dagen</p>
          </TooltipContent>
        </Tooltip>

        {/* Would Rehire */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="border-border/50 bg-gradient-to-br from-emerald-50/80 to-white/60 dark:from-emerald-950/30 dark:to-background/60 backdrop-blur-sm cursor-help">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Herplaatsbaar</span>
                  <TrendIcon trend={stats.rehireTrend} />
                </div>
                <div className="flex items-baseline gap-2">
                  <RefreshCw className="h-4 w-4 text-emerald-500" />
                  <span className="text-2xl font-semibold">{Math.round(stats.wouldRehirePercent)}</span>
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Opnieuw inzetten</p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>Percentage professionals dat opnieuw kan worden ingezet</p>
          </TooltipContent>
        </Tooltip>

        {/* Match Accuracy */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="border-border/50 bg-gradient-to-br from-blue-50/80 to-white/60 dark:from-blue-950/30 dark:to-background/60 backdrop-blur-sm cursor-help">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">AI Nauwkeurigheid</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <Target className="h-4 w-4 text-blue-500" />
                  <span className="text-2xl font-semibold">{Math.round(stats.matchAccuracy)}</span>
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Match voorspelling</p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>Hoe goed AI match scores correleren met positieve uitkomsten</p>
          </TooltipContent>
        </Tooltip>

        {/* Total Evaluations */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="border-border/50 bg-gradient-to-br from-purple-50/80 to-white/60 dark:from-purple-950/30 dark:to-background/60 backdrop-blur-sm cursor-help">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Evaluaties</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold">{stats.totalEvaluations}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">AI leert hiervan</p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>Totaal aantal evaluaties waarvan AI leert</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
