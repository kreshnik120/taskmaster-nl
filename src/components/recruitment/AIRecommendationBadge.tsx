import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AIRecommendationBadgeProps {
  matchScore: number;
  reasons?: string[];
}

export function AIRecommendationBadge({ matchScore, reasons = [] }: AIRecommendationBadgeProps) {
  // Show AI recommendation badge for high confidence matches (>= 75%)
  const isHighConfidence = matchScore >= 75;
  const isMediumConfidence = matchScore >= 60 && matchScore < 75;
  
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
