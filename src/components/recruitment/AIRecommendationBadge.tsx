import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";
import type { Json } from "@/integrations/supabase/types";

interface AIRecommendationBadgeProps {
  matchScore: number;
  reasons?: string[];
  entityType?: string;
  entityId?: string;
  recommendationType?: string;
}

// Log AI recommendation to audit trail (fire-and-forget)
async function logRecommendationAudit(
  recommendationType: string,
  entityType: string,
  entityId: string | undefined,
  matchScore: number,
  aiConfidence: number,
  recommendationData: Json
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;
    
    const { data: userOrg } = await supabase
      .from("user_organizations")
      .select("org_id")
      .eq("user_id", user.id)
      .single();
    
    if (!userOrg?.org_id) return;
    
    await supabase.from("ai_recommendation_audit").insert([{
      org_id: userOrg.org_id,
      user_id: user.id,
      recommendation_type: recommendationType,
      entity_type: entityType,
      entity_id: entityId || null,
      match_score: matchScore,
      ai_confidence: aiConfidence,
      recommendation_data: recommendationData
    }]);
  } catch (err) {
    // Silent fail - audit logging should not break UI
    console.debug("Audit log failed:", err);
  }
}

export function AIRecommendationBadge({ 
  matchScore, 
  reasons = [],
  entityType = "unknown",
  entityId,
  recommendationType = "match_suggestion"
}: AIRecommendationBadgeProps) {
  const hasLoggedRef = useRef(false);
  
  // Show AI recommendation badge for high confidence matches (>= 75%)
  const isHighConfidence = matchScore >= 75;
  const isMediumConfidence = matchScore >= 60 && matchScore < 75;
  
  // Log to audit trail on first render (once per badge instance)
  useEffect(() => {
    if ((isHighConfidence || isMediumConfidence) && !hasLoggedRef.current) {
      hasLoggedRef.current = true;
      const confidence = isHighConfidence ? matchScore / 100 : (matchScore - 10) / 100;
      logRecommendationAudit(
        recommendationType,
        entityType,
        entityId,
        matchScore,
        confidence,
        { reasons, badge_type: isHighConfidence ? "ai_recommended" : "promising" } as Json
      );
    }
  }, [matchScore, isHighConfidence, isMediumConfidence, entityType, entityId, recommendationType, reasons]);
  
  if (!isHighConfidence && !isMediumConfidence) return null;
  
  return (
    <>
      {isHighConfidence && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                variant="default" 
                className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 shadow-sm flex items-center gap-1 animate-in fade-in duration-300"
              >
                <Sparkles className="h-3 w-3" />
                AI Aanbevolen
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1">
                <p className="font-medium">AI Aanbeveling</p>
                <p className="text-xs text-muted-foreground">
                  Op basis van geleerde patronen en {matchScore}% match scoort deze klant hoog.
                </p>
                {reasons.length > 0 && (
                  <div className="text-xs mt-1">
                    <span className="font-medium">Sterke punten:</span>
                    <ul className="list-disc pl-4 mt-1">
                      {reasons.slice(0, 3).map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      
      {isMediumConfidence && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                variant="outline" 
                className="border-blue-400 text-blue-600 flex items-center gap-1"
              >
                <TrendingUp className="h-3 w-3" />
                Kansrijk
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">
                Goede match ({matchScore}%) met potentieel voor plaatsing
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </>
  );
}
