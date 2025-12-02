import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Lightbulb, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AIMatchInsightsProps {
  functieNiveau?: string;
  sector?: string[];
  doelgroep?: string[];
}

interface SuccessPattern {
  pattern: string;
  confidence: number;
  source: string;
}

export function AIMatchInsights({ functieNiveau, sector, doelgroep }: AIMatchInsightsProps) {
  const { data: insights, isLoading } = useQuery({
    queryKey: ["ai-match-insights", functieNiveau, sector?.join(","), doelgroep?.join(",")],
    queryFn: async (): Promise<SuccessPattern[]> => {
      // Query knowledge base for relevant success patterns
      const patterns: SuccessPattern[] = [];

      // Query success patterns from knowledge base (no org_id filter - knowledge is shared)
      const { data: knowledgeItems, error } = await supabase
        .from("ai_knowledge_base")
        .select("key, value, confidence_score, occurrence_count, category")
        .is("deleted_at", null)
        .in("category", ["recruitment", "placement_success", "match_patterns", "evaluation_learning"])
        .gte("confidence_score", 0.7)
        .order("occurrence_count", { ascending: false })
        .limit(10);

      if (error || !knowledgeItems) return [];

      // Filter and format relevant insights
      for (const item of knowledgeItems) {
        const value = item.value as any;
        const key = item.key?.toLowerCase() || '';
        
        // Check relevance to current candidate
        let isRelevant = false;
        let pattern = '';

        // Function level patterns
        if (functieNiveau && key.includes(functieNiveau.toLowerCase())) {
          isRelevant = true;
          pattern = value?.insight || value?.pattern || `${functieNiveau} professionals presteren beter bij bepaalde klanten`;
        }

        // Sector patterns
        if (sector?.length && sector.some(s => key.includes(s.toLowerCase()))) {
          isRelevant = true;
          const matchedSector = sector.find(s => key.includes(s.toLowerCase()));
          pattern = value?.insight || `${matchedSector} ervaring geeft +15% match score bij gerelateerde klanten`;
        }

        // General success patterns
        if (key.includes('success') || key.includes('match') || key.includes('placement')) {
          if (value?.insight || value?.pattern) {
            isRelevant = true;
            pattern = value.insight || value.pattern;
          }
        }

        if (isRelevant && pattern && patterns.length < 3) {
          patterns.push({
            pattern: pattern.length > 100 ? pattern.substring(0, 100) + '...' : pattern,
            confidence: item.confidence_score || 0.7,
            source: `${item.occurrence_count || 1}x waargenomen`
          });
        }
      }

      // Add default insights if none found
      if (patterns.length === 0 && functieNiveau) {
        patterns.push({
          pattern: `AI leert nog van ${functieNiveau} plaatsingen. Meer evaluaties verbeteren de suggesties.`,
          confidence: 0.5,
          source: 'Systeem'
        });
      }

      return patterns;
    },
    enabled: !!(functieNiveau || sector?.length || doelgroep?.length),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5">
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-3 w-full" />
      </div>
    );
  }

  if (!insights || insights.length === 0) {
    return null;
  }

  return (
    <div className="p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 space-y-2">
      <div className="flex items-center gap-2 text-primary">
        <Sparkles className="h-4 w-4" />
        <span className="text-xs font-medium">AI Match Tips</span>
      </div>
      {insights.map((insight, idx) => (
        <div key={idx} className="flex items-start gap-2">
          <Lightbulb className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground leading-relaxed">{insight.pattern}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{insight.source}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
